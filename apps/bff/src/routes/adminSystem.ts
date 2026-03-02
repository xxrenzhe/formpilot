import type { Context } from "hono"
import { requireAdmin } from "../admin"
import { supabase } from "../db"
import { jsonError } from "../response"

export async function adminSystemHealthHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  let supabaseOk = true
  let supabaseError = ""
  const { error: pingError } = await supabase.from("users").select("id").limit(1)
  if (pingError) {
    supabaseOk = false
    supabaseError = pingError.message
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: errorCount, error: logError } = await supabase
    .from("usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("success", false)
    .gte("timestamp", dayAgo)
  if (logError) {
    return jsonError(c, 500, { errorCode: "FORBIDDEN", message: "查询失败" })
  }

  const { count: activePrompts, error: promptError } = await supabase
    .from("prompt_templates")
    .select("id", { count: "exact", head: true })
    .eq("active", true)
  if (promptError) {
    return jsonError(c, 500, { errorCode: "FORBIDDEN", message: "查询失败" })
  }

  return c.json({
    bff: { ok: true },
    supabase: { ok: supabaseOk, error: supabaseError || undefined },
    promptTemplates: { active: activePrompts || 0 },
    recentErrors: errorCount || 0
  })
}
