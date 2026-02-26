import type { Context } from "hono"
import { z } from "zod"
import { requireAdmin } from "../admin"
import { supabase } from "../db"
import { jsonError } from "../response"

const listSchema = z.object({
  status: z.enum(["used", "unused"]).optional(),
  batchId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50)
})

export async function listAdminInvitesHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  const parsed = listSchema.safeParse(c.req.query())
  if (!parsed.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const { status, batchId, page, pageSize } = parsed.data
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let builder = supabase
    .from("invite_codes")
    .select("code,batch_id,created_at,redeemed_at,redeemed_by", { count: "exact" })

  if (batchId) builder = builder.eq("batch_id", batchId)
  if (status === "used") builder = builder.not("redeemed_at", "is", null)
  if (status === "unused") builder = builder.is("redeemed_at", null)

  const { data, error, count } = await builder.order("created_at", { ascending: false }).range(from, to)
  if (error) throw error

  const invites = (data || []).map((row) => ({
    code: row.code,
    batchId: row.batch_id,
    createdAt: row.created_at,
    redeemedAt: row.redeemed_at,
    redeemedBy: row.redeemed_by
  }))

  return c.json({ invites, page, pageSize, total: count || 0 })
}

export async function exportAdminInvitesHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  const parsed = listSchema.safeParse(c.req.query())
  if (!parsed.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const { status, batchId } = parsed.data
  let builder = supabase.from("invite_codes").select("code,batch_id,created_at,redeemed_at,redeemed_by")

  if (batchId) builder = builder.eq("batch_id", batchId)
  if (status === "used") builder = builder.not("redeemed_at", "is", null)
  if (status === "unused") builder = builder.is("redeemed_at", null)

  const { data, error } = await builder.order("created_at", { ascending: false })
  if (error) throw error

  const header = ["code", "batch_id", "created_at", "redeemed_at", "redeemed_by"].join(",")
  const lines = (data || []).map((row) => {
    const values = [row.code, row.batch_id, row.created_at, row.redeemed_at, row.redeemed_by]
    return values.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
  })

  const csv = [header, ...lines].join("\n")

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=invites.csv"
    }
  })
}
