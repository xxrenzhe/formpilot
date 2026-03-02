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
import { getAuthUser, type AuthUser } from "../auth"
import { jsonError } from "../response"
import { ensureDeviceCreditGrant, getOrCreateUserRecord, type UserRecord } from "../user"
import {
  resolveCreditCost,
  hasEnoughCredits,
  recordUsage,
  tryDeductCredits,
  addCredits,
  type CreditCostResult
} from "../usage"
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

type GeneratePayload = z.infer<typeof generateSchema>

interface PromptPreparationResult {
  selectedTemplate: Awaited<ReturnType<typeof getWeightedPromptTemplate>>
  missingFields: string[]
  systemPrompt: string
  userPrompt: string
  modelOverride: string
}

function resolveScenario(payload: GeneratePayload): AppScenario {
  if (env.adsOnlyMode) return "ads_compliance"
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

function extractClientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for") ||
    c.req.header("x-real-ip") ||
    ""
  )
}

function extractUserAgent(c: Context): string {
  return c.req.header("user-agent") || ""
}

async function requireAuthUser(c: Context): Promise<AuthUser | Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, {
      errorCode: "UNAUTHORIZED",
      message: "未登录"
    })
  }
  return authUser
}

async function parseGeneratePayload(c: Context): Promise<GeneratePayload | Response> {
  let rawPayload: unknown
  try {
    rawPayload = await c.req.json()
  } catch {
    return jsonError(c, 400, {
      errorCode: "INVALID_PARAMS",
      message: "参数错误"
    })
  }

  const parsedPayload = generateSchema.safeParse(rawPayload)
  if (!parsedPayload.success) {
    return jsonError(c, 400, {
      errorCode: "INVALID_PARAMS",
      message: "参数错误"
    })
  }

  return parsedPayload.data
}

async function loadUserWithDeviceCredits(c: Context, authUser: AuthUser): Promise<UserRecord> {
  let userRecord = await getOrCreateUserRecord(authUser.id, authUser.email)
  const deviceId = c.req.header("x-device-id") || ""
  const grantResult = await ensureDeviceCreditGrant({
    userId: userRecord.id,
    deviceId,
    claimIp: extractClientIp(c),
    claimUa: extractUserAgent(c),
    currentCredits: userRecord.credits
  })
  userRecord = {
    ...userRecord,
    credits: grantResult.credits
  }
  return userRecord
}

function insufficientCreditsResponse(
  c: Context,
  requiredCredits: number,
  currentCredits: number,
  includeUpgradeUrl: boolean
): Response {
  return jsonError(c, 402, {
    ...(includeUpgradeUrl ? { upgradeUrl: `${env.appBaseUrl}/recharge` } : {}),
    currentCredits,
    errorCode: "INSUFFICIENT_CREDITS",
    message: resolveUpgradeMessage(requiredCredits, currentCredits),
    requiredCredits
  })
}

function ensureEnoughCredits(c: Context, userRecord: UserRecord, cost: CreditCostResult): Response | null {
  if (hasEnoughCredits(userRecord.credits, cost.cost)) {
    return null
  }
  return insufficientCreditsResponse(c, cost.cost, userRecord.credits, true)
}

async function reserveCredits(
  c: Context,
  userRecord: UserRecord,
  cost: CreditCostResult
): Promise<Response | null> {
  const deducted = await tryDeductCredits(userRecord.id, cost.cost)
  if (deducted) return null
  return insufficientCreditsResponse(c, cost.cost, userRecord.credits, false)
}

function resolveModelOverride(scenario: AppScenario): string {
  return scenario === "ads_compliance" ? env.aiModelAds || env.aiModel : env.aiModelGeneral || env.aiModel
}

async function preparePrompt(
  payload: GeneratePayload,
  userRecord: UserRecord,
  scenario: AppScenario
): Promise<PromptPreparationResult> {
  const hasContextPool = Boolean(payload.contextPool?.trim())
  const shouldFetchProfile =
    scenario === "ads_compliance" && !payload.complianceSnapshot && !(payload.mode === "longDoc" && hasContextPool)

  const [profile, selectedTemplate] = await Promise.all([
    payload.complianceSnapshot
      ? Promise.resolve(payload.complianceSnapshot)
      : shouldFetchProfile
        ? getComplianceProfile(userRecord.id)
        : Promise.resolve(null),
    getWeightedPromptTemplate(scenario)
  ])

  const missingFields =
    scenario === "ads_compliance" && !(payload.mode === "longDoc" && hasContextPool)
      ? findComplianceMissingFields(profile || undefined)
      : []

  const contextPoolLimit = Number(process.env.CONTEXT_POOL_LIMIT || 12000)
  const cleanedContextPool = payload.contextPool
    ? summarizeContext(payload.contextPool, contextPoolLimit).summary
    : undefined

  const allowGlobalContext = payload.useGlobalContext !== false
  const contextLimit = Number(process.env.GLOBAL_CONTEXT_LIMIT || 8000)
  const cleanedContext =
    allowGlobalContext && payload.globalContext
      ? summarizeContext(payload.globalContext, contextLimit).summary
      : undefined

  const systemPrompt = buildSystemPrompt({
    scenario,
    pageContext: payload.pageContext,
    fieldContext: payload.fieldContext,
    complianceProfile: profile || undefined,
    templateBody: selectedTemplate?.templateBody,
    mode: payload.mode,
    userHint: payload.userHint || "",
    contextPool: cleanedContextPool,
    globalContext: cleanedContext
  })

  return {
    selectedTemplate,
    missingFields,
    systemPrompt,
    userPrompt: buildUserPrompt(payload.mode),
    modelOverride: resolveModelOverride(scenario)
  }
}

function streamGenerateResponse(
  c: Context,
  params: {
    userRecord: UserRecord
    cost: CreditCostResult
    scenario: AppScenario
    prompt: PromptPreparationResult
  }
): Response {
  const { userRecord, cost, scenario, prompt } = params
  return streamSSE(c, async (stream) => {
    try {
      await stream.writeSSE({
        event: "meta",
        data: JSON.stringify({
          scenario,
          creditsCost: cost.cost,
          costTier: cost.tier,
          templateId: prompt.selectedTemplate?.id || null,
          missingFields: prompt.missingFields
        })
      })

      await streamGenerate({
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        onToken: async (token) => {
          await stream.writeSSE({ data: token })
        },
        modelOverride: prompt.modelOverride
      })

      await recordUsage({
        userId: userRecord.id,
        requestType: "generate",
        tier: cost.tier,
        creditsCost: cost.cost,
        success: true,
        templateId: prompt.selectedTemplate?.id || null,
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
        templateId: prompt.selectedTemplate?.id || null,
        scenario
      })

      await stream.writeSSE({
        event: "error",
        data: error instanceof Error ? error.message : "生成失败"
      })
    }
  })
}

export async function generateHandler(c: Context): Promise<Response> {
  const authUser = await requireAuthUser(c)
  if (authUser instanceof Response) return authUser

  const payload = await parseGeneratePayload(c)
  if (payload instanceof Response) return payload

  const userRecord = await loadUserWithDeviceCredits(c, authUser)
  const scenario = resolveScenario(payload)
  const cost = resolveCreditCost(payload)

  const creditCheckError = ensureEnoughCredits(c, userRecord, cost)
  if (creditCheckError) return creditCheckError

  const reserveError = await reserveCredits(c, userRecord, cost)
  if (reserveError) return reserveError

  const prompt = await preparePrompt(payload, userRecord, scenario)
  return streamGenerateResponse(c, {
    userRecord,
    cost,
    scenario,
    prompt
  })
}
