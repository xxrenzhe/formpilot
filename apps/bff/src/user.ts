import { supabase } from "./db"
import { FREE_SIGNUP_CREDITS, addCredits } from "./usage"
import { env } from "./config"

export interface UserRecord {
  id: string
  email: string | null
  credits: number
  role: string | null
  createdAt: string | null
}

const DEVICE_ID_MAX_LENGTH = 64
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const CLAIM_IP_MAX_LENGTH = 64
const CLAIM_IP_PATTERN = /^[0-9A-Fa-f:.]+$/
const CLAIM_UA_MAX_LENGTH = 300
const IP_CLAIM_WINDOW_HOURS = Math.max(1, Number(env.trialIpClaimWindowHours || 24))
const IP_CLAIM_WINDOW_MS = IP_CLAIM_WINDOW_HOURS * 60 * 60 * 1000
const IP_CLAIM_MAX_PER_WINDOW = Math.max(1, Math.floor(Number(env.trialIpClaimMaxPerWindow || 4)))

function normalizeDeviceId(rawDeviceId?: string | null): string {
  const deviceId = (rawDeviceId || "").trim()
  if (!deviceId) return ""
  if (deviceId.length > DEVICE_ID_MAX_LENGTH) return ""
  if (!DEVICE_ID_PATTERN.test(deviceId)) return ""
  return deviceId
}

function normalizeClaimIp(rawClaimIp?: string | null): string {
  let claimIp = (rawClaimIp || "").split(",")[0]?.trim() || ""
  if (!claimIp) return ""

  if (claimIp.startsWith("[") && claimIp.includes("]")) {
    claimIp = claimIp.slice(1, claimIp.indexOf("]")).trim()
  } else if (claimIp.includes(".") && claimIp.split(":").length === 2) {
    claimIp = claimIp.replace(/:\d+$/, "")
  }

  if (!claimIp) return ""
  if (claimIp.length > CLAIM_IP_MAX_LENGTH) return ""
  if (!CLAIM_IP_PATTERN.test(claimIp)) return ""
  return claimIp
}

function normalizeClaimUa(rawClaimUa?: string | null): string {
  const claimUa = (rawClaimUa || "").trim().replace(/[\x00-\x1F\x7F]/g, "")
  if (!claimUa) return ""
  return claimUa.slice(0, CLAIM_UA_MAX_LENGTH)
}

async function recordTrialRateLimitedMetric(params: {
  userId: string
  hasClaimIp: boolean
}): Promise<void> {
  const { error } = await supabase.from("metrics_events").insert({
    user_id: params.userId,
    event_type: "paywall_shown",
    metadata: {
      reason: "trial_rate_limited",
      source: "device_credit_claim",
      hasClaimIp: params.hasClaimIp,
      windowHours: IP_CLAIM_WINDOW_HOURS,
      limit: IP_CLAIM_MAX_PER_WINDOW
    },
    timestamp: new Date().toISOString()
  })
  if (error) {
    // Best-effort metrics only, do not block core anti-abuse path.
    console.warn("[metrics] trial_rate_limited record failed:", error.message)
  }
}

function mapUserRow(row: {
  id: string
  email: string | null
  credits: number | null
  role?: string | null
  created_at?: string | null
}): UserRecord {
  return {
    id: row.id,
    email: row.email,
    credits: Number(row.credits || 0),
    role: row.role || "user",
    createdAt: row.created_at || null
  }
}

export async function getOrCreateUserRecord(userId: string, email: string | null): Promise<UserRecord> {
  const { data, error } = await supabase
    .from("users")
    .select("id,email,credits,role,created_at")
    .eq("id", userId)
    .maybeSingle()

  if (error) throw error
  if (data) return mapUserRow(data)

  const { data: inserted, error: insertError } = await supabase
    .from("users")
    .insert({
      id: userId,
      email,
      credits: 0
    })
    .select("id,email,credits,role,created_at")
    .single()

  if (insertError || !inserted) throw insertError
  return mapUserRow(inserted)
}

export async function ensureDeviceCreditGrant(params: {
  userId: string
  deviceId?: string | null
  claimIp?: string | null
  claimUa?: string | null
  currentCredits: number
}): Promise<{
  granted: boolean
  credits: number
  status: "granted" | "already_claimed" | "missing_device" | "rate_limited"
}> {
  const deviceId = normalizeDeviceId(params.deviceId)
  const claimIp = normalizeClaimIp(params.claimIp)
  const claimUa = normalizeClaimUa(params.claimUa)
  const currentCredits = Math.max(Number(params.currentCredits) || 0, 0)
  if (!deviceId) {
    return { granted: false, credits: currentCredits, status: "missing_device" }
  }

  const existingClaimQuery = `device_id.eq.${deviceId},first_user_id.eq.${params.userId}`
  const { data: existingClaim, error: existingClaimError } = await supabase
    .from("device_credit_claims")
    .select("device_id")
    .or(existingClaimQuery)
    .limit(1)
    .maybeSingle()
  if (existingClaimError) {
    throw existingClaimError
  }
  if (existingClaim) {
    return { granted: false, credits: currentCredits, status: "already_claimed" }
  }

  if (claimIp) {
    const ipWindowStart = new Date(Date.now() - IP_CLAIM_WINDOW_MS).toISOString()
    const { count: ipClaimCount, error: ipClaimError } = await supabase
      .from("device_credit_claims")
      .select("device_id", { count: "exact", head: true })
      .eq("claim_ip", claimIp)
      .gte("created_at", ipWindowStart)

    // If new columns are not deployed yet, skip this guardrail to keep backward compatibility.
    if (ipClaimError && ipClaimError.code !== "42703") {
      throw ipClaimError
    }
    if (!ipClaimError && Number(ipClaimCount || 0) >= IP_CLAIM_MAX_PER_WINDOW) {
      await recordTrialRateLimitedMetric({
        userId: params.userId,
        hasClaimIp: true
      })
      return { granted: false, credits: currentCredits, status: "rate_limited" }
    }
  }

  const claimInsertPayload = {
    device_id: deviceId,
    first_user_id: params.userId,
    claimed_credits: FREE_SIGNUP_CREDITS,
    claim_ip: claimIp || null,
    claim_ua: claimUa || null
  }
  const fallbackInsertPayload = {
    device_id: deviceId,
    first_user_id: params.userId,
    claimed_credits: FREE_SIGNUP_CREDITS
  }

  let { data, error } = await supabase
    .from("device_credit_claims")
    .insert(claimInsertPayload)
    .select("device_id")
    .maybeSingle()

  if (error?.code === "42703") {
    const fallback = await supabase
      .from("device_credit_claims")
      .insert(fallbackInsertPayload)
      .select("device_id")
      .maybeSingle()
    data = fallback.data
    error = fallback.error
  }

  if (error && error.code !== "23505") {
    throw error
  }

  if (!data) {
    return { granted: false, credits: currentCredits, status: "already_claimed" }
  }

  const credits = await addCredits(params.userId, FREE_SIGNUP_CREDITS)
  return { granted: true, credits, status: "granted" }
}

export async function getUserById(userId: string): Promise<UserRecord | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id,email,credits,role,created_at")
    .eq("id", userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return mapUserRow(data)
}
