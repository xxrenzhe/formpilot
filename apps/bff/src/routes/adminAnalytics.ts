import type { Context } from "hono"
import { requireAdmin } from "../admin"
import { supabase } from "../db"
import { jsonError } from "../response"
import { getPromptPerformance } from "../promptTemplates"

function dayKeyFromIso(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10)
  return date.toISOString().slice(0, 10)
}

export async function adminAnalyticsHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: usageRows, error: usageError } = await supabase
    .from("usage_logs")
    .select("timestamp,scenario,success")
    .eq("request_type", "generate")
    .gte("timestamp", since)
  if (usageError) return jsonError(c, 500, { errorCode: "FORBIDDEN", message: "查询失败" })

  const { data: metricRows, error: metricError } = await supabase
    .from("metrics_events")
    .select("timestamp,event_type")
    .in("event_type", ["appeal_feedback_success", "appeal_feedback_fail"])
    .gte("timestamp", since)
  if (metricError) return jsonError(c, 500, { errorCode: "FORBIDDEN", message: "查询失败" })

  const usageByDay = new Map<string, { generated: number; success: number }>()
  ;(usageRows || []).forEach((row) => {
    const key = dayKeyFromIso(row.timestamp || "")
    const current = usageByDay.get(key) || { generated: 0, success: 0 }
    if (row.scenario === "ads_compliance") {
      current.generated += 1
      if (row.success) current.success += 1
    }
    usageByDay.set(key, current)
  })

  const feedbackByDay = new Map<string, { success: number; fail: number }>()
  ;(metricRows || []).forEach((row) => {
    const key = dayKeyFromIso(row.timestamp || "")
    const current = feedbackByDay.get(key) || { success: 0, fail: 0 }
    if (row.event_type === "appeal_feedback_success") current.success += 1
    if (row.event_type === "appeal_feedback_fail") current.fail += 1
    feedbackByDay.set(key, current)
  })

  const allDays = Array.from(new Set([...usageByDay.keys(), ...feedbackByDay.keys()])).sort()
  const daily = allDays.map((day) => {
    const usage = usageByDay.get(day) || { generated: 0, success: 0 }
    const feedback = feedbackByDay.get(day) || { success: 0, fail: 0 }
    return {
      day,
      ads_generated: usage.generated,
      generation_success: usage.success,
      feedback_success: feedback.success,
      feedback_fail: feedback.fail
    }
  })

  const generatedAppeals = daily.reduce((sum, row) => sum + row.ads_generated, 0)
  const successFeedback = daily.reduce((sum, row) => sum + row.feedback_success, 0)
  const failFeedback = daily.reduce((sum, row) => sum + row.feedback_fail, 0)
  const totalFeedback = successFeedback + failFeedback
  const feedbackRate = generatedAppeals > 0 ? totalFeedback / generatedAppeals : 0
  const approvalSignal = totalFeedback > 0 ? successFeedback / totalFeedback : 0

  const promptPerformance = await getPromptPerformance()

  return c.json({
    daily,
    funnel: {
      generatedAppeals,
      successFeedback,
      failFeedback,
      feedbackRate,
      approvalSignal
    },
    promptPerformance
  })
}
