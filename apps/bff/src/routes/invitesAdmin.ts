import type { Context } from "hono"
import { z } from "zod"
import { jsonError } from "../response"
import { env } from "../config"
import { supabase } from "../db"
import { formatInviteCode, generateInviteCodes } from "../invites"

const generateSchema = z.object({
  count: z.number().int().min(1).max(1000),
  batchId: z.string().optional()
})

export async function generateInvitesHandler(c: Context): Promise<Response> {
  if (!env.adminToken) {
    return jsonError(c, 500, { errorCode: "MISSING_CONFIG", message: "未配置管理员令牌" })
  }

  const token = c.req.header("x-admin-token") || ""
  if (token !== env.adminToken) {
    return jsonError(c, 403, { errorCode: "FORBIDDEN", message: "无权限" })
  }

  const payload = generateSchema.safeParse(await c.req.json())
  if (!payload.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const codes = generateInviteCodes(payload.data.count)
  const rows = codes.map((code) => ({
    code,
    batch_id: payload.data.batchId || null
  }))

  const { error } = await supabase.from("invite_codes").insert(rows)
  if (error) throw error

  return c.json({
    batchId: payload.data.batchId || null,
    count: codes.length,
    codes: codes.map(formatInviteCode),
    rawCodes: codes
  })
}
