import type { Context } from "hono"
import { z } from "zod"
import { requireAdmin } from "../admin"
import { supabase } from "../db"
import { jsonError } from "../response"
import { formatInviteCode } from "../invites"

const listSchema = z.object({
  status: z.enum(["used", "unused"]).optional(),
  batchNote: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100)
})

interface BatchSummary {
  batchNote: string
  credits: number
  total: number
  redeemed: number
  remaining: number
}

function buildBatchSummary(rows: Array<{ batch_note: string | null; credits: number | null; redeemed_at: string | null }>): BatchSummary[] {
  const map = new Map<string, BatchSummary>()
  rows.forEach((row) => {
    const batchNote = row.batch_note || "未命名批次"
    const credits = Number(row.credits || 0)
    const key = `${batchNote}::${credits}`
    const current = map.get(key) || {
      batchNote,
      credits,
      total: 0,
      redeemed: 0,
      remaining: 0
    }
    current.total += 1
    if (row.redeemed_at) {
      current.redeemed += 1
    }
    current.remaining = current.total - current.redeemed
    map.set(key, current)
  })

  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

export async function listAdminInvitesHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  const parsed = listSchema.safeParse(c.req.query())
  if (!parsed.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const { status, batchNote, page, pageSize } = parsed.data
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let builder = supabase
    .from("invite_codes")
    .select("code,batch_note,credits,created_at,redeemed_at,redeemed_by", { count: "exact" })

  if (batchNote) builder = builder.ilike("batch_note", `%${batchNote}%`)
  if (status === "used") builder = builder.not("redeemed_at", "is", null)
  if (status === "unused") builder = builder.is("redeemed_at", null)

  const { data, error, count } = await builder.order("created_at", { ascending: false }).range(from, to)
  if (error) throw error

  const inviteRows = data || []
  const invites = inviteRows.map((row) => ({
    code: formatInviteCode(row.code),
    batchNote: row.batch_note,
    credits: Number(row.credits || 0),
    createdAt: row.created_at,
    redeemedAt: row.redeemed_at,
    redeemedBy: row.redeemed_by
  }))

  const { data: summaryRows, error: summaryError } = await supabase
    .from("invite_codes")
    .select("batch_note,credits,redeemed_at")
    .order("created_at", { ascending: false })
  if (summaryError) throw summaryError

  return c.json({
    invites,
    batches: buildBatchSummary(summaryRows || []),
    page,
    pageSize,
    total: count || 0
  })
}

export async function exportAdminInvitesHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  const parsed = listSchema.safeParse(c.req.query())
  if (!parsed.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const { status, batchNote } = parsed.data
  let builder = supabase.from("invite_codes").select("code,batch_note,credits,created_at,redeemed_at,redeemed_by")
  if (batchNote) builder = builder.ilike("batch_note", `%${batchNote}%`)
  if (status === "used") builder = builder.not("redeemed_at", "is", null)
  if (status === "unused") builder = builder.is("redeemed_at", null)

  const { data, error } = await builder.order("created_at", { ascending: false })
  if (error) throw error

  const header = ["code", "batch_note", "credits", "created_at", "redeemed_at", "redeemed_by"].join(",")
  const lines = (data || []).map((row) => {
    const values = [formatInviteCode(row.code), row.batch_note, row.credits, row.created_at, row.redeemed_at, row.redeemed_by]
    return values.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
  })

  const csv = [header, ...lines].join("\n")
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=credits-batches.csv"
    }
  })
}
