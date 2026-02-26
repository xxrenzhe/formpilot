import { supabase } from "./db"

export const FREE_MONTHLY_LIMIT = 20
export const PRO_DAILY_LIMIT = Number(process.env.PRO_DAILY_LIMIT || 200)

function monthRange(date: Date): { start: string; end: string; key: string } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0))
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0))
  const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`
  return { start: start.toISOString(), end: end.toISOString(), key }
}

function dayRange(date: Date): { start: string; end: string } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0))
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0))
  return { start: start.toISOString(), end: end.toISOString() }
}

export async function getMonthlyUsageCount(userId: string, now: Date): Promise<number> {
  const { start, end } = monthRange(now)
  const { count, error } = await supabase
    .from("usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("timestamp", start)
    .lt("timestamp", end)

  if (error) throw error
  return count || 0
}

export async function getDailyUsageCount(userId: string, now: Date): Promise<number> {
  const { start, end } = dayRange(now)
  const { count, error } = await supabase
    .from("usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("timestamp", start)
    .lt("timestamp", end)

  if (error) throw error
  return count || 0
}

export async function recordUsage(params: {
  userId: string
  requestType: "generate"
  tokens?: number
  isFree: boolean
  success: boolean
}): Promise<void> {
  const { error } = await supabase.from("usage_logs").insert({
    user_id: params.userId,
    request_type: params.requestType,
    tokens: params.tokens || 0,
    is_free: params.isFree,
    success: params.success,
    timestamp: new Date().toISOString()
  })

  if (error) throw error
}

export function getUsageMonthKey(now: Date): string {
  return monthRange(now).key
}
