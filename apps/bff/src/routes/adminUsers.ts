import type { Context } from "hono"
import { z } from "zod"
import { requireAdmin } from "../admin"
import { supabase } from "../db"
import { jsonError } from "../response"

const querySchema = z.object({
  query: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
})

export async function listAdminUsersHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  const parsed = querySchema.safeParse(c.req.query())
  if (!parsed.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const { query, page, pageSize } = parsed.data
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let builder = supabase
    .from("users")
    .select("id,email,credits,created_at,role", { count: "exact" })

  if (query) {
    builder = builder.or(`email.ilike.%${query}%,id.ilike.%${query}%`)
  }

  const { data, error, count } = await builder.order("created_at", { ascending: false }).range(from, to)
  if (error) throw error

  const ids = (data || []).map((row) => row.id)
  const lastUsageMap = new Map<string, string>()
  if (ids.length) {
    const { data: usageRows, error: usageError } = await supabase
      .from("usage_logs")
      .select("user_id,timestamp")
      .in("user_id", ids)
      .order("timestamp", { ascending: false })
    if (usageError) throw usageError
    ;(usageRows || []).forEach((row) => {
      if (!row.user_id || lastUsageMap.has(row.user_id)) return
      lastUsageMap.set(row.user_id, row.timestamp || "")
    })
  }

  const users = (data || []).map((row) => ({
    id: row.id,
    email: row.email,
    credits: Number(row.credits || 0),
    createdAt: row.created_at,
    role: row.role,
    lastUsage: lastUsageMap.get(row.id) || null
  }))

  return c.json({
    users,
    page,
    pageSize,
    total: count || 0
  })
}

export async function getAdminUserHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  const userId = c.req.param("id")
  const { data, error } = await supabase
    .from("users")
    .select("id,email,credits,created_at,role")
    .eq("id", userId)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    return jsonError(c, 404, { errorCode: "FORBIDDEN", message: "用户不存在" })
  }

  const { data: usageRows } = await supabase
    .from("usage_logs")
    .select("timestamp")
    .eq("user_id", userId)
    .order("timestamp", { ascending: false })
    .limit(1)

  return c.json({
    user: {
      id: data.id,
      email: data.email,
      credits: Number(data.credits || 0),
      createdAt: data.created_at,
      role: data.role,
      lastUsage: usageRows?.[0]?.timestamp || null
    }
  })
}
