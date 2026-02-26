import type { Context } from "hono"
import { z } from "zod"
import { requireAdmin } from "../admin"
import { supabase } from "../db"
import { jsonError } from "../response"
import { recordAdminAudit } from "../audit"

const planSchema = z.object({
  plan: z.enum(["free", "pro"]),
  currentPeriodEnd: z.string().datetime().nullable().optional()
})

export async function updateAdminPlanHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  const userId = c.req.param("id")
  const payload = planSchema.safeParse(await c.req.json())
  if (!payload.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const nextPlan = payload.data.plan
  const nextEnd = nextPlan === "free" ? null : payload.data.currentPeriodEnd || null

  const { data, error } = await supabase
    .from("users")
    .update({
      plan: nextPlan,
      current_period_end: nextEnd
    })
    .eq("id", userId)
    .select("id")
    .maybeSingle()

  if (error) throw error
  if (!data) {
    return jsonError(c, 404, { errorCode: "FORBIDDEN", message: "用户不存在" })
  }

  await recordAdminAudit({
    adminId: admin.id,
    actionType: "plan_update",
    targetId: userId,
    metadata: { plan: nextPlan, currentPeriodEnd: nextEnd }
  })

  return c.json({ success: true })
}
