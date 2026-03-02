import {
  resolveCreditCost as resolveSharedCreditCost,
  type CreditCostResult,
  type CreditCostTier,
  type GenerateRequest
} from "@formpilot/shared"
import { supabase } from "./db"
import { env } from "./config"

export const FREE_SIGNUP_CREDITS = Number.isFinite(env.freeSignupCredits) ? env.freeSignupCredits : 20
export type { CreditCostResult } from "@formpilot/shared"

export function resolveCreditCost(payload: GenerateRequest): CreditCostResult {
  return resolveSharedCreditCost({
    fieldContext: payload.fieldContext,
    mode: payload.mode,
    userHint: payload.userHint,
    globalContext: payload.globalContext,
    contextPool: payload.contextPool
  })
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
