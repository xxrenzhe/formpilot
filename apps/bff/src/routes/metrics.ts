import type { Context } from "hono"
import { z } from "zod"
import { getAuthUser } from "../auth"
import { jsonError } from "../response"
import { supabase } from "../db"

const metricSchema = z.object({
  eventType: z.string().min(1),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
})

export async function metricsHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, { errorCode: "UNAUTHORIZED", message: "未登录" })
  }

  const payload = metricSchema.safeParse(await c.req.json())
  if (!payload.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const { error } = await supabase.from("metrics_events").insert({
    user_id: authUser.id,
    event_type: payload.data.eventType,
    metadata: payload.data.metadata || null,
    timestamp: new Date().toISOString()
  })

  if (error) {
    return jsonError(c, 500, { errorCode: "FORBIDDEN", message: "记录失败" })
  }

  return c.json({ success: true })
}
