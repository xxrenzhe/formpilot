import type { Context } from "hono"
import { z } from "zod"
import { buildSystemPrompt } from "@formpilot/shared"
import { getAuthUser } from "../auth"
import { jsonError } from "../response"
import { getOrCreateUserRecord } from "../user"
import { FREE_MONTHLY_LIMIT, PRO_DAILY_LIMIT, getDailyUsageCount, getMonthlyUsageCount, recordUsage } from "../usage"
import { getPersona } from "../personas"
import { streamGenerate } from "../ai"
import { env } from "../config"
import { streamSSE } from "hono/streaming"
import type { UserPersona } from "@formpilot/shared"

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
  personaId: z.string().optional(),
  personaSnapshot: z
    .object({
      id: z.string(),
      name: z.string(),
      isDefault: z.boolean(),
      coreIdentity: z.string(),
      companyInfo: z.string(),
      tonePreference: z.string(),
      customRules: z.string().optional()
    })
    .optional(),
  userHint: z.string().optional(),
  mode: z.enum(["shortText", "longDoc"]),
  useGlobalContext: z.boolean().optional(),
  globalContext: z.string().optional()
})

function buildUserPrompt(mode: "shortText" | "longDoc"): string {
  if (mode === "longDoc") {
    return "请生成完整的文档正文，包含清晰的标题层级与专业结构。"
  }
  return "请生成简洁、专业、与问题匹配的回复。"
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
      errorCode: "FORBIDDEN",
      message: "参数错误"
    })
  }

  const userRecord = await getOrCreateUserRecord(authUser.id, authUser.email)
  const now = new Date()
  const upgradeUrl = `${env.appBaseUrl}/pricing`

  if (payload.data.mode === "longDoc" && userRecord.plan !== "pro") {
    return jsonError(c, 403, {
      errorCode: "FORBIDDEN",
      message: "长文档生成仅对 Pro 开放",
      upgradeUrl
    })
  }

  if (userRecord.plan === "free") {
    const used = await getMonthlyUsageCount(userRecord.id, now)
    if (used >= FREE_MONTHLY_LIMIT) {
      return jsonError(c, 403, {
        errorCode: "USAGE_LIMIT",
        message: "免费额度已用完",
        upgradeUrl
      })
    }
  } else {
    const dailyUsed = await getDailyUsageCount(userRecord.id, now)
    if (dailyUsed >= PRO_DAILY_LIMIT) {
      return jsonError(c, 403, {
        errorCode: "USAGE_LIMIT",
        message: "今日请求已达上限，请稍后再试"
      })
    }
  }

  let persona: UserPersona | null = null
  if (payload.data.personaSnapshot) {
    persona = payload.data.personaSnapshot
  } else if (payload.data.personaId) {
    persona = await getPersona(userRecord.id, payload.data.personaId)
  }

  if (!persona) {
    return jsonError(c, 400, {
      errorCode: "FORBIDDEN",
      message: "缺少人设信息"
    })
  }

  const globalContext = userRecord.plan === "pro" ? payload.data.globalContext : undefined
  const systemPrompt = buildSystemPrompt({
    pageContext: payload.data.pageContext,
    fieldContext: payload.data.fieldContext,
    persona,
    userHint: payload.data.userHint || "",
    globalContext
  })

  const userPrompt = buildUserPrompt(payload.data.mode)
  const byokKey = c.req.header("x-byok-key") || ""
  const apiKeyOverride = userRecord.plan === "pro" && byokKey ? byokKey : undefined

  return streamSSE(c, async (stream) => {
    try {
      await streamGenerate({
        systemPrompt,
        userPrompt,
        onToken: async (token) => {
          await stream.writeSSE({ data: token })
        },
        apiKeyOverride
      })
      await recordUsage({
        userId: userRecord.id,
        requestType: "generate",
        isFree: userRecord.plan === "free",
        success: true
      })
    } catch (error) {
      await recordUsage({
        userId: userRecord.id,
        requestType: "generate",
        isFree: userRecord.plan === "free",
        success: false
      })
      await stream.writeSSE({
        event: "error",
        data: error instanceof Error ? error.message : "生成失败"
      })
    }
  })
}
