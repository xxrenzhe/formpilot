import type { Context } from "hono"
import { z } from "zod"
import type { AppScenario } from "@formpilot/shared"
import { getAuthUser } from "../auth"
import { jsonError } from "../response"
import { recordPromptFeedback } from "../promptTemplates"
import { supabase } from "../db"

const feedbackSchema = z.object({
  templateId: z.string().uuid(),
  scenario: z.enum(["general", "ads_compliance"]),
  outcome: z.enum(["success", "fail"]),
  note: z.string().max(500).optional()
})

export async function promptFeedbackHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, { errorCode: "UNAUTHORIZED", message: "未登录" })
  }

  const payload = feedbackSchema.safeParse(await c.req.json())
  if (!payload.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  await recordPromptFeedback({
    userId: authUser.id,
    templateId: payload.data.templateId,
    scenario: payload.data.scenario as AppScenario,
    outcome: payload.data.outcome,
    note: payload.data.note
  })

  const metricType = payload.data.outcome === "success" ? "draft_accepted" : "draft_rejected"
  const { error } = await supabase.from("metrics_events").insert({
    user_id: authUser.id,
    event_type: metricType,
    metadata: {
      templateId: payload.data.templateId,
      scenario: payload.data.scenario
    },
    timestamp: new Date().toISOString()
  })
  if (error) throw error

  return c.json({ success: true })
}
