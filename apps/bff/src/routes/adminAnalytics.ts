import type { Context } from "hono"
import { requireAdmin } from "../admin"
import { supabase } from "../db"
import { jsonError } from "../response"

export async function adminAnalyticsHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  const { data: daily, error: dailyError } = await supabase
    .from("metrics_daily_kpis")
    .select("day,panel_users,generate_users,copy_users,paywall_users")
    .order("day", { ascending: false })
    .limit(30)

  if (dailyError) {
    return jsonError(c, 500, { errorCode: "FORBIDDEN", message: "查询失败" })
  }

  const now = Date.now()
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: panelRows, error: panelError } = await supabase
    .from("metrics_events")
    .select("user_id,timestamp")
    .eq("event_type", "panel_open")
    .gte("timestamp", monthAgo)

  if (panelError) {
    return jsonError(c, 500, { errorCode: "FORBIDDEN", message: "查询失败" })
  }

  const mauSet = new Set<string>()
  const dauSet = new Set<string>()
  const dayAgoMs = Date.parse(dayAgo)

  ;(panelRows || []).forEach((row) => {
    if (!row.user_id) return
    mauSet.add(row.user_id)
    const timestamp = row.timestamp ? Date.parse(row.timestamp) : 0
    if (timestamp >= dayAgoMs) {
      dauSet.add(row.user_id)
    }
  })

  const { data: funnelRows, error: funnelError } = await supabase
    .from("metrics_user_funnel")
    .select("first_generate_at, first_copy_at, first_paywall_at")

  if (funnelError) {
    return jsonError(c, 500, { errorCode: "FORBIDDEN", message: "查询失败" })
  }

  const rows = funnelRows || []
  const generateUsers = rows.filter((row) => row.first_generate_at).length
  const copyUsers = rows.filter((row) => row.first_copy_at).length
  const paywallUsers = rows.filter((row) => row.first_paywall_at).length
  const ahaRate = generateUsers > 0 ? copyUsers / generateUsers : 0
  const paywallRate = generateUsers > 0 ? paywallUsers / generateUsers : 0

  const { count: paidUsers, error: paidError } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .not("stripe_subscription_id", "is", null)

  if (paidError) {
    return jsonError(c, 500, { errorCode: "FORBIDDEN", message: "查询失败" })
  }

  const paidCount = paidUsers || 0
  const paidConversionRate = paywallUsers > 0 ? paidCount / paywallUsers : 0

  return c.json({
    daily: (daily || []).slice().reverse(),
    funnel: {
      generateUsers,
      copyUsers,
      paywallUsers,
      ahaRate,
      paywallRate,
      dau: dauSet.size,
      mau: mauSet.size,
      paidUsers: paidCount,
      paidConversionRate
    }
  })
}
