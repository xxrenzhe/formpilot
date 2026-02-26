import type { Context } from "hono"
import { getAuthUser } from "../auth"
import { jsonError } from "../response"
import { supabase } from "../db"

export async function metricsFunnelHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, { errorCode: "UNAUTHORIZED", message: "未登录" })
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

  const { data, error } = await supabase
    .from("metrics_user_funnel")
    .select("first_generate_at, first_copy_at")

  if (error) {
    return jsonError(c, 500, { errorCode: "FORBIDDEN", message: "查询失败" })
  }

  const rows = data || []
  const generateUsers = rows.filter((row) => row.first_generate_at).length
  const copyUsers = rows.filter((row) => row.first_copy_at).length
  const ahaRate = generateUsers > 0 ? copyUsers / generateUsers : 0

  return c.json({
    generateUsers,
    copyUsers,
    ahaRate,
    dau: dauSet.size,
    mau: mauSet.size
  })
}
