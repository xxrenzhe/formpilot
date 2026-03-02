import type { Context } from "hono"
import { z } from "zod"
import type { AppScenario } from "@formpilot/shared"
import { getAuthUser } from "../auth"
import { jsonError } from "../response"
import { supabase } from "../db"
import { env } from "../config"

const APPEAL_FEEDBACK_DEDUP_WINDOW_MS = 30 * 60 * 1000

const appealFeedbackSchema = z.object({
  templateId: z.string().uuid(),
  scenario: z.enum(["general", "ads_compliance"]).optional(),
  outcome: z.enum(["success", "fail"]),
  note: z.string().max(500).optional()
})

function readMetadataValue(input: unknown, key: string): string {
  if (!input || typeof input !== "object") return ""
  const record = input as Record<string, unknown>
  const value = record[key]
  return typeof value === "string" ? value : ""
}

export async function appealFeedbackHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, { errorCode: "UNAUTHORIZED", message: "未登录" })
  }

  const payload = appealFeedbackSchema.safeParse(await c.req.json())
  if (!payload.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }
  const effectiveScenario: AppScenario = env.adsOnlyMode
    ? "ads_compliance"
    : ((payload.data.scenario || "general") as AppScenario)

  const metricType =
    payload.data.outcome === "success" ? "appeal_feedback_success" : "appeal_feedback_fail"
  const dedupSince = new Date(Date.now() - APPEAL_FEEDBACK_DEDUP_WINDOW_MS).toISOString()

  const { data: recentRows, error: recentError } = await supabase
    .from("metrics_events")
    .select("metadata,timestamp")
    .eq("user_id", authUser.id)
    .eq("event_type", metricType)
    .gte("timestamp", dedupSince)
    .order("timestamp", { ascending: false })
    .limit(10)
  if (recentError) throw recentError

  const duplicated = (recentRows || []).some((row) => {
    const templateId = readMetadataValue(row.metadata, "templateId")
    const scenario = readMetadataValue(row.metadata, "scenario")
    return templateId === payload.data.templateId && scenario === effectiveScenario
  })
  if (duplicated) {
    return c.json({ success: true, recorded: false })
  }

  const { error: insertError } = await supabase.from("metrics_events").insert({
    user_id: authUser.id,
    event_type: metricType,
    metadata: {
      templateId: payload.data.templateId,
      scenario: effectiveScenario,
      note: payload.data.note || null,
      source: "extension_manual"
    },
    timestamp: new Date().toISOString()
  })
  if (insertError) throw insertError

  return c.json({ success: true, recorded: true })
}
