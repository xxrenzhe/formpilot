import type { CreditCostTier, GenerateRequest } from "@formpilot/shared"
import { supabase } from "./db"
import { env } from "./config"

export const FREE_SIGNUP_CREDITS = Number.isFinite(env.freeSignupCredits) ? env.freeSignupCredits : 20

export interface CreditCostResult {
  tier: CreditCostTier
  cost: number
}

export function resolveCreditCost(payload: GenerateRequest): CreditCostResult {
  const contextLength = (payload.globalContext || "").length
  const hintLength = (payload.userHint || "").length
  const fieldType = payload.fieldContext.type.toLowerCase()
  const fieldSignal = `${payload.fieldContext.label} ${payload.fieldContext.placeholder} ${
    payload.fieldContext.surroundingText || ""
  }`.toLowerCase()

  if (
    contextLength > 7000 ||
    hintLength > 2500 ||
    fieldType.includes("file") ||
    fieldSignal.includes("upload") ||
    fieldSignal.includes("attachment")
  ) {
    return { tier: "evidence_heavy", cost: 10 }
  }

  if (payload.mode === "longDoc") {
    return { tier: "long_doc", cost: 5 }
  }

  return { tier: "short_text", cost: 1 }
}

export function hasEnoughCredits(currentCredits: number, cost: number): boolean {
  return currentCredits >= Math.max(cost, 0)
}

export async function tryDeductCredits(userId: string, cost: number): Promise<boolean> {
  if (cost <= 0) return true

  const { data, error } = await supabase.rpc("decrement_user_credits", {
    p_user_id: userId,
    p_cost: cost
  })

  if (error) return false
  return Boolean(data)
}

export async function addCredits(userId: string, amount: number): Promise<number> {
  const safeAmount = Math.max(0, Math.floor(amount))
  const { data, error } = await supabase.rpc("increment_user_credits", {
    p_user_id: userId,
    p_amount: safeAmount
  })
  if (error) throw error
  return Number(data || 0)
}

export async function getLifetimeCreditsUsed(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("get_lifetime_credits_used_sum", {
    p_user_id: userId
  })

  if (error) throw error
  return Number(data || 0)
}

export async function recordUsage(params: {
  userId: string
  requestType: "generate"
  tier: CreditCostTier
  creditsCost: number
  success: boolean
  templateId?: string | null
  scenario?: string
}): Promise<void> {
  const { error } = await supabase.from("usage_logs").insert({
    user_id: params.userId,
    request_type: params.requestType,
    credits_cost: Math.max(0, params.creditsCost),
    cost_tier: params.tier,
    success: params.success,
    prompt_template_id: params.templateId || null,
    scenario: params.scenario || null,
    timestamp: new Date().toISOString()
  })

  if (error) throw error
}
