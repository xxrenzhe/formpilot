import type { Context } from "hono"
import { z } from "zod"
import { getAuthUser } from "../auth"
import { jsonError } from "../response"
import { getOrCreateUserRecord } from "../user"
import { countPersonas, createPersona, deletePersona, listPersonas, updatePersona } from "../personas"
import { supabase } from "../db"

const personaSchema = z.object({
  name: z.string().min(1),
  isDefault: z.boolean(),
  coreIdentity: z.string().min(1),
  companyInfo: z.string().min(1),
  tonePreference: z.string().min(1),
  customRules: z.string().optional()
})

async function ensureSingleDefault(userId: string): Promise<void> {
  const { error } = await supabase.from("personas").update({ is_default: false }).eq("user_id", userId)
  if (error) throw error
}

export async function listPersonasHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, { errorCode: "UNAUTHORIZED", message: "未登录" })
  }

  await getOrCreateUserRecord(authUser.id, authUser.email)
  const personas = await listPersonas(authUser.id)
  return c.json({ personas })
}

export async function createPersonaHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, { errorCode: "UNAUTHORIZED", message: "未登录" })
  }

  const userRecord = await getOrCreateUserRecord(authUser.id, authUser.email)
  const payload = personaSchema.safeParse(await c.req.json())
  if (!payload.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const existingCount = await countPersonas(userRecord.id)
  const limit = userRecord.plan === "pro" ? 5 : 1
  if (existingCount >= limit) {
    return jsonError(c, 403, { errorCode: "FORBIDDEN", message: "人设数量已达上限" })
  }

  if (payload.data.isDefault) {
    await ensureSingleDefault(userRecord.id)
  }

  const persona = await createPersona(userRecord.id, payload.data)
  return c.json({ persona })
}

export async function updatePersonaHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, { errorCode: "UNAUTHORIZED", message: "未登录" })
  }

  await getOrCreateUserRecord(authUser.id, authUser.email)
  const personaId = c.req.param("id")
  const payload = personaSchema.safeParse(await c.req.json())
  if (!payload.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  if (payload.data.isDefault) {
    await ensureSingleDefault(authUser.id)
  }

  const persona = await updatePersona(authUser.id, personaId, payload.data)
  return c.json({ persona })
}

export async function deletePersonaHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, { errorCode: "UNAUTHORIZED", message: "未登录" })
  }

  await getOrCreateUserRecord(authUser.id, authUser.email)
  const personaId = c.req.param("id")
  await deletePersona(authUser.id, personaId)
  return c.json({ success: true })
}
