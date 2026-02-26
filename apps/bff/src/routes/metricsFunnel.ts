import type { Context } from "hono"
import { getAuthUser } from "../auth"
import { jsonError } from "../response"
import { supabase } from "../db"

export async function metricsFunnelHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, { errorCode: "UNAUTHORIZED", message: "未登录" })
  }

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
    ahaRate
  })
}
