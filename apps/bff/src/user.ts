import { supabase } from "./db"
import type { UserPlan } from "@formpilot/shared"

export interface UserRecord {
  id: string
  email: string | null
  plan: UserPlan
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  currentPeriodEnd: string | null
}

export async function getOrCreateUserRecord(userId: string, email: string | null): Promise<UserRecord> {
  const { data, error } = await supabase
    .from("users")
    .select("id,email,plan,stripe_customer_id,stripe_subscription_id,current_period_end")
    .eq("id", userId)
    .maybeSingle()

  if (error) throw error

  if (data) {
    return {
      id: data.id,
      email: data.email,
      plan: (data.plan as UserPlan) || "free",
      stripeCustomerId: data.stripe_customer_id,
      stripeSubscriptionId: data.stripe_subscription_id,
      currentPeriodEnd: data.current_period_end
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("users")
    .insert({
      id: userId,
      email,
      plan: "free"
    })
    .select("id,email,plan,stripe_customer_id,stripe_subscription_id,current_period_end")
    .single()

  if (insertError || !inserted) throw insertError

  return {
    id: inserted.id,
    email: inserted.email,
    plan: (inserted.plan as UserPlan) || "free",
    stripeCustomerId: inserted.stripe_customer_id,
    stripeSubscriptionId: inserted.stripe_subscription_id,
    currentPeriodEnd: inserted.current_period_end
  }
}

export async function updateUserPlan(userId: string, plan: UserPlan, stripeData?: {
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  currentPeriodEnd?: string | null
}): Promise<void> {
  const payload: Record<string, unknown> = {
    plan,
    stripe_customer_id: stripeData?.stripeCustomerId || null,
    stripe_subscription_id: stripeData?.stripeSubscriptionId || null,
    current_period_end: stripeData?.currentPeriodEnd || null
  }

  const { error } = await supabase.from("users").update(payload).eq("id", userId)
  if (error) throw error
}

export async function findUserByStripeCustomerId(stripeCustomerId: string): Promise<UserRecord | null> {
  if (!stripeCustomerId) return null
  const { data, error } = await supabase
    .from("users")
    .select("id,email,plan,stripe_customer_id,stripe_subscription_id,current_period_end")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    email: data.email,
    plan: (data.plan as UserPlan) || "free",
    stripeCustomerId: data.stripe_customer_id,
    stripeSubscriptionId: data.stripe_subscription_id,
    currentPeriodEnd: data.current_period_end
  }
}

function isInviteTrialExpired(user: UserRecord, now: Date): boolean {
  if (user.plan !== "pro") return false
  if (user.stripeSubscriptionId) return false
  if (!user.currentPeriodEnd) return false
  const end = new Date(user.currentPeriodEnd)
  if (Number.isNaN(end.getTime())) return false
  return end.getTime() <= now.getTime()
}

export async function ensureActivePlan(user: UserRecord, now: Date = new Date()): Promise<UserRecord> {
  if (!isInviteTrialExpired(user, now)) return user
  const { error } = await supabase
    .from("users")
    .update({ plan: "free", current_period_end: null })
    .eq("id", user.id)
  if (error) throw error
  return { ...user, plan: "free", currentPeriodEnd: null }
}
