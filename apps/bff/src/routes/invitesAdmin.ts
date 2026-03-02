import type { Context } from "hono"
import { z } from "zod"
import { jsonError } from "../response"
import { env } from "../config"
import { supabase } from "../db"
import { formatInviteCode, generateInviteCodes } from "../invites"
import { requireAdmin } from "../admin"
import { recordAdminAudit } from "../audit"

const generateSchema = z.object({
  count: z.number().int().min(1).max(5000),
  credits: z.number().int().min(1).max(5000),
  batchNote: z.string().min(1).max(200)
})

export async function generateInvitesHandler(c: Context): Promise<Response> {
  let adminId: string | null = null
  const token = c.req.header("x-admin-token") || ""
  if (token && env.adminToken && token === env.adminToken) {
    adminId = null
  } else {
    const admin = await requireAdmin(c)
    if (admin instanceof Response) return admin
    adminId = admin.id
  }

  const payload = generateSchema.safeParse(await c.req.json())
  if (!payload.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const codes = generateInviteCodes(payload.data.count)
  const rows = codes.map((code) => ({
    code,
    credits: payload.data.credits,
    batch_note: payload.data.batchNote
  }))

  const { error } = await supabase.from("invite_codes").insert(rows)
  if (error) throw error

  await recordAdminAudit({
    adminId,
    actionType: "invite_generate",
    metadata: {
      count: codes.length,
      credits: payload.data.credits,
      batchNote: payload.data.batchNote
    }
  })

  return c.json({
    count: codes.length,
    credits: payload.data.credits,
    batchNote: payload.data.batchNote,
    codes: codes.map(formatInviteCode),
    rawCodes: codes
  })
}
