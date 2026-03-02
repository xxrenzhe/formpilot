import type { Context } from "hono"
import { z } from "zod"
import { getAuthUser } from "../auth"
import { jsonError } from "../response"
import { getOrCreateUserRecord } from "../user"
import { supabase } from "../db"
import { normalizeInviteCode } from "../invites"
import { recordAdminAudit } from "../audit"
import { addCredits } from "../usage"

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
    return jsonError(c, 400, { errorCode: "INVALID_CODE", message: "充值码无效或已被使用" })
  }

  const userRecord = await getOrCreateUserRecord(authUser.id, authUser.email)
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from("invite_codes")
    .update({
      redeemed_at: now,
      redeemed_by: userRecord.id,
      redeemed_ip: c.req.header("x-forwarded-for") || null,
      redeemed_ua: c.req.header("user-agent") || null
    })
    .eq("code", normalized)
    .is("redeemed_at", null)
    .select("code,credits,batch_note")
    .maybeSingle()

  if (error) throw error
  if (!data) {
    return jsonError(c, 400, { errorCode: "INVALID_CODE", message: "充值码无效或已被使用" })
  }

  const creditsAdded = Math.max(0, Number(data.credits || 0))
  const credits = await addCredits(userRecord.id, creditsAdded)

  await recordAdminAudit({
    adminId: null,
    actionType: "invite_redeem",
    targetId: userRecord.id,
    metadata: {
      code: normalized,
      creditsAdded,
      batchNote: data.batch_note || null
    }
  })

  return c.json({ creditsAdded, credits })
}
