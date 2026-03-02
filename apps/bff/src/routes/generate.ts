import type { Context } from "hono"
import { z } from "zod"
import {
  buildSystemPrompt,
  buildUserPrompt,
  findComplianceMissingFields,
  isLikelyAdsScenario,
  type AppScenario
} from "@formpilot/shared"
import { streamSSE } from "hono/streaming"
import { getAuthUser } from "../auth"
import { jsonError } from "../response"
import { ensureDeviceCreditGrant, getOrCreateUserRecord } from "../user"
import { resolveCreditCost, hasEnoughCredits, recordUsage, tryDeductCredits, addCredits } from "../usage"
import { streamGenerate } from "../ai"
import { env } from "../config"
import { summarizeContext } from "../context"
import { getComplianceProfile } from "../compliance"
import { getWeightedPromptTemplate } from "../promptTemplates"

const pageContextSchema = z.object({
  title: z.string(),
  description: z.string(),
  lang: z.string(),
  url: z.string().optional()
})

const fieldContextSchema = z.object({
  label: z.string(),
  placeholder: z.string(),
  type: z.string(),
  surroundingText: z.string().optional()
})

const generateSchema = z.object({
  pageContext: pageContextSchema,
  fieldContext: fieldContextSchema,
  scenario: z.enum(["general", "ads_compliance"]).optional(),
  complianceSnapshot: z
    .object({
      legalName: z.string(),
      website: z.string(),
      businessCategory: z.string(),
      hasOwnFactory: z.boolean(),
      fulfillmentModel: z.string(),
      returnPolicyUrl: z.string(),
      supportEmail: z.string(),
      supportPhone: z.string(),
      additionalEvidence: z.string().optional()
    })
    .optional(),
  userHint: z.string().optional(),
  mode: z.enum(["shortText", "longDoc"]),
  contextPool: z.string().optional(),
  useGlobalContext: z.boolean().optional(),
  globalContext: z.string().optional()
})

function resolveScenario(payload: z.infer<typeof generateSchema>): AppScenario {
  if (payload.scenario) return payload.scenario
  if (
    isLikelyAdsScenario({
      url: payload.pageContext.url,
      title: payload.pageContext.title,
      description: payload.pageContext.description
    })
  ) {
    return "ads_compliance"
  }
  return "general"
}

function resolveUpgradeMessage(required: number, balance: number): string {
  return `点数不足：本次生成需 ${required} 点，当前仅剩 ${balance} 点。请输入充值码后继续。`
}

export async function generateHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, {
      errorCode: "UNAUTHORIZED",
      message: "未登录"
    })
  }

  const payload = generateSchema.safeParse(await c.req.json())
  if (!payload.success) {
    return jsonError(c, 400, {
      errorCode: "INVALID_PARAMS",
      message: "参数错误"
    })
  }

  let userRecord = await getOrCreateUserRecord(authUser.id, authUser.email)
  const deviceId = c.req.header("x-device-id") || ""
  const grantResult = await ensureDeviceCreditGrant({
    userId: userRecord.id,
    deviceId,
    currentCredits: userRecord.credits
  })
  userRecord = {
    ...userRecord,
    credits: grantResult.credits
  }

  const scenario = resolveScenario(payload.data)
  const cost = resolveCreditCost(payload.data)
  const hasContextPool = Boolean(payload.data.contextPool?.trim())

  if (!hasEnoughCredits(userRecord.credits, cost.cost)) {
    return jsonError(c, 402, {
      errorCode: "INSUFFICIENT_CREDITS",
      message: resolveUpgradeMessage(cost.cost, userRecord.credits),
      requiredCredits: cost.cost,
      currentCredits: userRecord.credits,
      upgradeUrl: `${env.appBaseUrl}/recharge`
    })
  }

  const deducted = await tryDeductCredits(userRecord.id, cost.cost)
  if (!deducted) {
    return jsonError(c, 402, {
      errorCode: "INSUFFICIENT_CREDITS",
      message: resolveUpgradeMessage(cost.cost, userRecord.credits),
      requiredCredits: cost.cost,
      currentCredits: userRecord.credits
    })
  }

  const shouldFetchProfile =
    scenario === "ads_compliance" &&
    !payload.data.complianceSnapshot &&
    !(payload.data.mode === "longDoc" && hasContextPool)

  const [profile, selectedTemplate] = await Promise.all([
    payload.data.complianceSnapshot
      ? Promise.resolve(payload.data.complianceSnapshot)
      : shouldFetchProfile
        ? getComplianceProfile(userRecord.id)
        : Promise.resolve(null),
    getWeightedPromptTemplate(scenario)
  ])
  const missingFields =
    scenario === "ads_compliance" && !(payload.data.mode === "longDoc" && hasContextPool)
      ? findComplianceMissingFields(profile || undefined)
      : []

  const contextPoolLimit = Number(process.env.CONTEXT_POOL_LIMIT || 12000)
  const cleanedContextPool = payload.data.contextPool
    ? summarizeContext(payload.data.contextPool, contextPoolLimit).summary
    : undefined
  const allowGlobalContext = payload.data.useGlobalContext !== false
  const contextLimit = Number(process.env.GLOBAL_CONTEXT_LIMIT || 8000)
  const cleanedContext =
    allowGlobalContext && payload.data.globalContext
      ? summarizeContext(payload.data.globalContext, contextLimit).summary
      : undefined

  const systemPrompt = buildSystemPrompt({
    scenario,
    pageContext: payload.data.pageContext,
    fieldContext: payload.data.fieldContext,
    complianceProfile: profile || undefined,
    templateBody: selectedTemplate?.templateBody,
    mode: payload.data.mode,
    userHint: payload.data.userHint || "",
    contextPool: cleanedContextPool,
    globalContext: cleanedContext
  })
  const userPrompt = buildUserPrompt(payload.data.mode)

  const modelOverride =
    scenario === "ads_compliance" ? env.aiModelAds || env.aiModel : env.aiModelGeneral || env.aiModel

  return streamSSE(c, async (stream) => {
    try {
      await stream.writeSSE({
        event: "meta",
        data: JSON.stringify({
          scenario,
          creditsCost: cost.cost,
          costTier: cost.tier,
          templateId: selectedTemplate?.id || null,
          missingFields
        })
      })

      await streamGenerate({
        systemPrompt,
        userPrompt,
        onToken: async (token) => {
          await stream.writeSSE({ data: token })
        },
        modelOverride
      })

      await recordUsage({
        userId: userRecord.id,
        requestType: "generate",
        tier: cost.tier,
        creditsCost: cost.cost,
        success: true,
        templateId: selectedTemplate?.id || null,
        scenario
      })
    } catch (error) {
      await addCredits(userRecord.id, cost.cost)
      await recordUsage({
        userId: userRecord.id,
        requestType: "generate",
        tier: cost.tier,
        creditsCost: cost.cost,
        success: false,
        templateId: selectedTemplate?.id || null,
        scenario
      })

      await stream.writeSSE({
        event: "error",
        data: error instanceof Error ? error.message : "生成失败"
      })
    }
  })
}
