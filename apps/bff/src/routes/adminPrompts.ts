import type { Context } from "hono"
import { z } from "zod"
import type { AppScenario } from "@formpilot/shared"
import { requireAdmin } from "../admin"
import { jsonError } from "../response"
import {
  createPromptTemplate,
  getPromptPerformance,
  listPromptTemplates,
  updatePromptTemplate
} from "../promptTemplates"
import { recordAdminAudit } from "../audit"

const promptSchema = z.object({
  scenario: z.enum(["general", "ads_compliance"]),
  name: z.string().min(1).max(120),
  templateBody: z.string().min(1).max(10000),
  weight: z.number().min(0.1).max(100),
  active: z.boolean()
})

const updateSchema = z.object({
  name: z.string().min(1).max(120),
  templateBody: z.string().min(1).max(10000),
  weight: z.number().min(0.1).max(100),
  active: z.boolean()
})

export async function listAdminPromptsHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  const scenario = c.req.query("scenario")
  const promptList = await listPromptTemplates(
    scenario === "general" || scenario === "ads_compliance" ? (scenario as AppScenario) : undefined
  )

  return c.json({ prompts: promptList })
}

export async function createAdminPromptHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  const payload = promptSchema.safeParse(await c.req.json())
  if (!payload.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const prompt = await createPromptTemplate(payload.data)
  await recordAdminAudit({
    adminId: admin.id,
    actionType: "prompt_create",
    targetId: prompt.id,
    metadata: { scenario: prompt.scenario, name: prompt.name }
  })

  return c.json({ prompt })
}

export async function updateAdminPromptHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  const promptId = c.req.param("id")
  const payload = updateSchema.safeParse(await c.req.json())
  if (!payload.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const prompt = await updatePromptTemplate({
    id: promptId,
    ...payload.data
  })

  await recordAdminAudit({
    adminId: admin.id,
    actionType: "prompt_update",
    targetId: prompt.id,
    metadata: { scenario: prompt.scenario, name: prompt.name, weight: prompt.weight, active: prompt.active }
  })

  return c.json({ prompt })
}

export async function promptPerformanceHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  const rows = await getPromptPerformance()
  return c.json({ rows })
}
