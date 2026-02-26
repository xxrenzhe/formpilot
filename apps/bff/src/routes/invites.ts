import type { Context } from "hono"
import { z } from "zod"
import { getAuthUser } from "../auth"
import { jsonError } from "../response"
import { ensureActivePlan, getOrCreateUserRecord } from "../user"
import { supabase } from "../db"
import { env } from "../config"
import { normalizeInviteCode } from "../invites"
import { recordAdminAudit } from "../audit"

const redeemSchema = z.object({
  code: z.string().min(1)
})

export async function redeemInviteHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, { errorCode: "UNAUTHORIZED", message: "未登录" })
  }

  const payload = redeemSchema.safeParse(await c.req.json())
  if (!payload.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const normalized = normalizeInviteCode(payload.data.code)
  if (!normalized) {
    return jsonError(c, 400, { errorCode: "INVALID_CODE", message: "邀请码无效或已被使用" })
  }

  const userRecord = await ensureActivePlan(await getOrCreateUserRecord(authUser.id, authUser.email))
  if (userRecord.plan !== "free") {
    return jsonError(c, 403, { errorCode: "FORBIDDEN", message: "仅限 Free 用户兑换" })
  }

  const now = new Date()
  const trialDays =
    Number.isFinite(env.inviteTrialDays) && env.inviteTrialDays > 0 ? env.inviteTrialDays : 7
  const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from("invite_codes")
    .update({
      redeemed_at: now.toISOString(),
      redeemed_by: userRecord.id,
      redeemed_ip: c.req.header("x-forwarded-for") || null,
      redeemed_ua: c.req.header("user-agent") || null
    })
    .eq("code", normalized)
    .is("redeemed_at", null)
    .select("code")
    .maybeSingle()

  if (error) throw error
  if (!data) {
    return jsonError(c, 400, { errorCode: "INVALID_CODE", message: "邀请码无效或已被使用" })
  }

  const { error: updateError } = await supabase
    .from("users")
    .update({
      plan: "pro",
      current_period_end: trialEndsAt
    })
    .eq("id", userRecord.id)

  if (updateError) throw updateError

  await recordAdminAudit({
    adminId: null,
    actionType: "invite_redeem",
    targetId: userRecord.id,
    metadata: { code: normalized }
  })

  return c.json({ plan: "pro", trialEndsAt })
}
