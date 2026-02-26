import type { Context } from "hono"
import { supabase } from "./db"

export interface AuthUser {
  id: string
  email: string | null
}

function extractBearerToken(authHeader: string | undefined): string {
  if (!authHeader) return ""
  if (!authHeader.toLowerCase().startsWith("bearer ")) return ""
  return authHeader.slice(7).trim()
}

export async function getAuthUser(c: Context): Promise<AuthUser | null> {
  const token = extractBearerToken(c.req.header("Authorization"))
  if (!token) return null

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null

  return { id: data.user.id, email: data.user.email ?? null }
}
