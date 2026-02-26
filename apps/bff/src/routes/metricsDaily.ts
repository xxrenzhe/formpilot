import type { Context } from "hono"
import { getAuthUser } from "../auth"
import { jsonError } from "../response"
import { supabase } from "../db"

export async function metricsDailyHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, { errorCode: "UNAUTHORIZED", message: "未登录" })
  }

  const { data, error } = await supabase
    .from("metrics_daily_kpis")
    .select("day,panel_users,generate_users,copy_users,paywall_users")
    .order("day", { ascending: false })
    .limit(14)

  if (error) {
    return jsonError(c, 500, { errorCode: "FORBIDDEN", message: "查询失败" })
  }

  return c.json({ rows: data || [] })
}
