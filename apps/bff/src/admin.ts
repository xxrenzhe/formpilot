import type { Context } from "hono"
import { getAuthUser } from "./auth"
import { jsonError } from "./response"
import { supabase } from "./db"

export interface AdminUser {
  id: string
  email: string | null
  role: string | null
}

export async function requireAdmin(c: Context): Promise<AdminUser | Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, { errorCode: "UNAUTHORIZED", message: "未登录" })
  }

  const { data, error } = await supabase
    .from("users")
    .select("id,email,role")
    .eq("id", authUser.id)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    return jsonError(c, 403, { errorCode: "FORBIDDEN", message: "未授权" })
  }
  if (data.role !== "admin") {
    return jsonError(c, 403, { errorCode: "FORBIDDEN", message: "需要管理员权限" })
  }

  return {
    id: data.id,
    email: data.email,
    role: data.role
  }
}
