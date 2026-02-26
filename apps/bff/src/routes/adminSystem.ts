import type { Context } from "hono"
import Stripe from "stripe"
import { requireAdmin } from "../admin"
import { supabase } from "../db"
import { env } from "../config"
import { jsonError } from "../response"

export async function adminSystemHealthHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  let supabaseOk = true
  let supabaseError = ""
  const { error: supabasePingError } = await supabase.from("users").select("id").limit(1)
  if (supabasePingError) {
    supabaseOk = false
    supabaseError = supabasePingError.message
  }

  let stripeStatus: { ok: boolean; status: "ok" | "disabled" | "error"; error?: string } = {
    ok: false,
    status: "disabled"
  }

  if (env.stripeSecretKey) {
    try {
      const stripe = new Stripe(env.stripeSecretKey, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion })
      await stripe.balance.retrieve()
      stripeStatus = { ok: true, status: "ok" }
    } catch (error) {
      stripeStatus = {
        ok: false,
        status: "error",
        error: error instanceof Error ? error.message : "Stripe 连接失败"
      }
    }
  }

  const now = Date.now()
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const { count: errorCount, error: logError } = await supabase
    .from("usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("success", false)
    .gte("timestamp", dayAgo)

  if (logError) {
    return jsonError(c, 500, { errorCode: "FORBIDDEN", message: "查询失败" })
  }

  return c.json({
    bff: { ok: true },
    supabase: { ok: supabaseOk, error: supabaseError || undefined },
    stripe: stripeStatus,
    recentErrors: errorCount || 0
  })
}
