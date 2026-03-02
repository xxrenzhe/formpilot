import { supabase } from "./db"
import { FREE_SIGNUP_CREDITS, addCredits } from "./usage"

export interface UserRecord {
  id: string
  email: string | null
  credits: number
  role: string | null
  createdAt: string | null
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
  currentCredits: number
}): Promise<{ granted: boolean; credits: number; status: "granted" | "already_claimed" | "missing_device" }> {
  const deviceId = (params.deviceId || "").trim()
  const currentCredits = Math.max(Number(params.currentCredits) || 0, 0)
  if (!deviceId) {
    return { granted: false, credits: currentCredits, status: "missing_device" }
  }

  const { data, error } = await supabase
    .from("device_credit_claims")
    .insert({
      device_id: deviceId,
      first_user_id: params.userId,
      claimed_credits: FREE_SIGNUP_CREDITS
    })
    .select("device_id")
    .maybeSingle()

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
