import { supabase } from "./db"
import type { UserPersona } from "@formpilot/shared"

export async function listPersonas(userId: string): Promise<UserPersona[]> {
  const { data, error } = await supabase
    .from("personas")
    .select("id,name,is_default,core_identity,company_info,tone_preference,custom_rules")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })

  if (error) throw error

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
    coreIdentity: row.core_identity,
    companyInfo: row.company_info,
    tonePreference: row.tone_preference,
    customRules: row.custom_rules || undefined
  }))
}

export async function countPersonas(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("personas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)

  if (error) throw error
  return count || 0
}

export async function getPersona(userId: string, personaId: string): Promise<UserPersona | null> {
  const { data, error } = await supabase
    .from("personas")
    .select("id,name,is_default,core_identity,company_info,tone_preference,custom_rules")
    .eq("user_id", userId)
    .eq("id", personaId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    name: data.name,
    isDefault: data.is_default,
    coreIdentity: data.core_identity,
    companyInfo: data.company_info,
    tonePreference: data.tone_preference,
    customRules: data.custom_rules || undefined
  }
}

export async function createPersona(userId: string, persona: Omit<UserPersona, "id">): Promise<UserPersona> {
  const { data, error } = await supabase
    .from("personas")
    .insert({
      user_id: userId,
      name: persona.name,
      is_default: persona.isDefault,
      core_identity: persona.coreIdentity,
      company_info: persona.companyInfo,
      tone_preference: persona.tonePreference,
      custom_rules: persona.customRules || null
    })
    .select("id,name,is_default,core_identity,company_info,tone_preference,custom_rules")
    .single()

  if (error || !data) throw error

  return {
    id: data.id,
    name: data.name,
    isDefault: data.is_default,
    coreIdentity: data.core_identity,
    companyInfo: data.company_info,
    tonePreference: data.tone_preference,
    customRules: data.custom_rules || undefined
  }
}

export async function updatePersona(userId: string, personaId: string, persona: Omit<UserPersona, "id">): Promise<UserPersona> {
  const { data, error } = await supabase
    .from("personas")
    .update({
      name: persona.name,
      is_default: persona.isDefault,
      core_identity: persona.coreIdentity,
      company_info: persona.companyInfo,
      tone_preference: persona.tonePreference,
      custom_rules: persona.customRules || null
    })
    .eq("user_id", userId)
    .eq("id", personaId)
    .select("id,name,is_default,core_identity,company_info,tone_preference,custom_rules")
    .single()

  if (error || !data) throw error

  return {
    id: data.id,
    name: data.name,
    isDefault: data.is_default,
    coreIdentity: data.core_identity,
    companyInfo: data.company_info,
    tonePreference: data.tone_preference,
    customRules: data.custom_rules || undefined
  }
}

export async function deletePersona(userId: string, personaId: string): Promise<void> {
  const { error } = await supabase.from("personas").delete().eq("user_id", userId).eq("id", personaId)
  if (error) throw error
}
