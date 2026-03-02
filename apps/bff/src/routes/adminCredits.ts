import type { Context } from "hono"
import { z } from "zod"
import { requireAdmin } from "../admin"
import { supabase } from "../db"
import { jsonError } from "../response"
import { recordAdminAudit } from "../audit"

const creditsSchema = z.object({
  credits: z.number().int().min(0).max(100000)
})

export async function updateAdminCreditsHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  const userId = c.req.param("id")
  const payload = creditsSchema.safeParse(await c.req.json())
  if (!payload.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const { data, error } = await supabase
    .from("users")
    .update({ credits: payload.data.credits })
    .eq("id", userId)
    .select("id")
    .maybeSingle()

  if (error) throw error
  if (!data) {
    return jsonError(c, 404, { errorCode: "FORBIDDEN", message: "用户不存在" })
  }

  await recordAdminAudit({
    adminId: admin.id,
    actionType: "credits_update",
    targetId: userId,
    metadata: {
      credits: payload.data.credits
    }
  })

  return c.json({ success: true })
}
