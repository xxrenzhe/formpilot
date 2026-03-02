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

function readMetricReason(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return ""
  const value = (metadata as Record<string, unknown>).reason
  return typeof value === "string" ? value : ""
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
    .select("timestamp,event_type,metadata")
    .in("event_type", ["draft_accepted", "draft_rejected", "appeal_feedback_success", "appeal_feedback_fail", "paywall_shown"])
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

  const feedbackByDay = new Map<
    string,
    {
      draftSuccess: number
      draftFail: number
      appealSuccess: number
      appealFail: number
      trialRateLimited: number
    }
  >()
  ;(metricRows || []).forEach((row) => {
    const key = dayKeyFromIso(row.timestamp || "")
    const current = feedbackByDay.get(key) || {
      draftSuccess: 0,
      draftFail: 0,
      appealSuccess: 0,
      appealFail: 0,
      trialRateLimited: 0
    }
    if (row.event_type === "draft_accepted") current.draftSuccess += 1
    if (row.event_type === "draft_rejected") current.draftFail += 1
    if (row.event_type === "appeal_feedback_success") current.appealSuccess += 1
    if (row.event_type === "appeal_feedback_fail") current.appealFail += 1
    if (row.event_type === "paywall_shown" && readMetricReason(row.metadata) === "trial_rate_limited") {
      current.trialRateLimited += 1
    }
    feedbackByDay.set(key, current)
  })

  const allDays = Array.from(new Set([...usageByDay.keys(), ...feedbackByDay.keys()])).sort()
  const daily = allDays.map((day) => {
    const usage = usageByDay.get(day) || { generated: 0, success: 0 }
    const feedback = feedbackByDay.get(day) || {
      draftSuccess: 0,
      draftFail: 0,
      appealSuccess: 0,
      appealFail: 0,
      trialRateLimited: 0
    }
    return {
      day,
      ads_generated: usage.generated,
      generation_success: usage.success,
      draft_feedback_success: feedback.draftSuccess,
      draft_feedback_fail: feedback.draftFail,
      appeal_feedback_success: feedback.appealSuccess,
      appeal_feedback_fail: feedback.appealFail,
      trial_rate_limited: feedback.trialRateLimited
    }
  })

  const generatedAppeals = daily.reduce((sum, row) => sum + row.ads_generated, 0)
  const draftSuccessFeedback = daily.reduce((sum, row) => sum + row.draft_feedback_success, 0)
  const draftFailFeedback = daily.reduce((sum, row) => sum + row.draft_feedback_fail, 0)
  const draftTotalFeedback = draftSuccessFeedback + draftFailFeedback
  const draftFeedbackRate = generatedAppeals > 0 ? draftTotalFeedback / generatedAppeals : 0
  const draftAdoptionSignal = draftTotalFeedback > 0 ? draftSuccessFeedback / draftTotalFeedback : 0

  const appealSuccessFeedback = daily.reduce((sum, row) => sum + row.appeal_feedback_success, 0)
  const appealFailFeedback = daily.reduce((sum, row) => sum + row.appeal_feedback_fail, 0)
  const appealTotalFeedback = appealSuccessFeedback + appealFailFeedback
  const appealFeedbackRate = generatedAppeals > 0 ? appealTotalFeedback / generatedAppeals : 0
  const approvalSignal = appealTotalFeedback > 0 ? appealSuccessFeedback / appealTotalFeedback : 0
  const trialRateLimitedCount = daily.reduce((sum, row) => sum + row.trial_rate_limited, 0)

  const promptPerformance = await getPromptPerformance()

  return c.json({
    daily,
    funnel: {
      generatedAppeals,
      draftSuccessFeedback,
      draftFailFeedback,
      draftFeedbackRate,
      draftAdoptionSignal,
      appealSuccessFeedback,
      appealFailFeedback,
      appealFeedbackRate,
      approvalSignal,
      trialRateLimitedCount,
      // Legacy fields for backward compatibility.
      // `successFeedback/failFeedback/feedbackRate` now map to draft-level signals.
      successFeedback: draftSuccessFeedback,
      failFeedback: draftFailFeedback,
      feedbackRate: draftFeedbackRate
    },
    promptPerformance
  })
}
