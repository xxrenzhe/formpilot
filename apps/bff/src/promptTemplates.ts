import type { AppScenario, PromptTemplate } from "@formpilot/shared"
import { supabase } from "./db"

function mapTemplate(row: {
  id: string
  scenario: string
  name: string
  template_body: string
  weight: number | null
  active: boolean | null
  updated_at: string
}): PromptTemplate {
  return {
    id: row.id,
    scenario: row.scenario as AppScenario,
    name: row.name,
    templateBody: row.template_body,
    weight: Number(row.weight || 1),
    active: Boolean(row.active),
    updatedAt: row.updated_at
  }
}

function pickWeightedTemplate(templates: PromptTemplate[]): PromptTemplate | null {
  if (!templates.length) return null
  const normalized = templates.map((item) => ({
    ...item,
    weight: Math.max(0.1, item.weight || 1)
  }))
  const total = normalized.reduce((sum, item) => sum + item.weight, 0)
  const pivot = Math.random() * total
  let cumulative = 0
  for (const item of normalized) {
    cumulative += item.weight
    if (pivot <= cumulative) return item
  }
  return normalized[normalized.length - 1]
}

export async function getWeightedPromptTemplate(scenario: AppScenario): Promise<PromptTemplate | null> {
  const { data, error } = await supabase
    .from("prompt_templates")
    .select("id,scenario,name,template_body,weight,active,updated_at")
    .eq("scenario", scenario)
    .eq("active", true)
    .order("updated_at", { ascending: false })

  if (error) throw error
  const templates = (data || []).map(mapTemplate)
  return pickWeightedTemplate(templates)
}

export async function listPromptTemplates(scenario?: AppScenario): Promise<PromptTemplate[]> {
  let builder = supabase
    .from("prompt_templates")
    .select("id,scenario,name,template_body,weight,active,updated_at")
    .order("updated_at", { ascending: false })

  if (scenario) {
    builder = builder.eq("scenario", scenario)
  }

  const { data, error } = await builder
  if (error) throw error
  return (data || []).map(mapTemplate)
}

export async function updatePromptTemplate(input: {
  id: string
  name: string
  templateBody: string
  weight: number
  active: boolean
}): Promise<PromptTemplate> {
  const { data, error } = await supabase
    .from("prompt_templates")
    .update({
      name: input.name.trim(),
      template_body: input.templateBody.trim(),
      weight: Math.max(0.1, Math.min(100, input.weight)),
      active: input.active,
      updated_at: new Date().toISOString()
    })
    .eq("id", input.id)
    .select("id,scenario,name,template_body,weight,active,updated_at")
    .single()

  if (error || !data) throw error
  return mapTemplate(data)
}

export async function createPromptTemplate(input: {
  scenario: AppScenario
  name: string
  templateBody: string
  weight: number
  active: boolean
}): Promise<PromptTemplate> {
  const { data, error } = await supabase
    .from("prompt_templates")
    .insert({
      scenario: input.scenario,
      name: input.name.trim(),
      template_body: input.templateBody.trim(),
      weight: Math.max(0.1, Math.min(100, input.weight)),
      active: input.active
    })
    .select("id,scenario,name,template_body,weight,active,updated_at")
    .single()

  if (error || !data) throw error
  return mapTemplate(data)
}

export async function recordPromptFeedback(input: {
  userId: string
  templateId: string
  scenario: AppScenario
  outcome: "success" | "fail"
  note?: string
}): Promise<void> {
  const { error } = await supabase.from("prompt_feedback").insert({
    user_id: input.userId,
    prompt_template_id: input.templateId,
    scenario: input.scenario,
    outcome: input.outcome,
    note: input.note || null
  })
  if (error) throw error

  const delta = input.outcome === "success" ? 0.15 : -0.25
  const { data: row, error: queryError } = await supabase
    .from("prompt_templates")
    .select("weight")
    .eq("id", input.templateId)
    .maybeSingle()
  if (queryError) throw queryError
  if (!row) return

  const nextWeight = Math.max(0.1, Math.min(100, Number(row.weight || 1) + delta))
  const { error: updateError } = await supabase
    .from("prompt_templates")
    .update({ weight: nextWeight, updated_at: new Date().toISOString() })
    .eq("id", input.templateId)
  if (updateError) throw updateError
}

export async function getPromptPerformance(): Promise<
  Array<{
    templateId: string
    name: string
    scenario: AppScenario
    weight: number
    success: number
    fail: number
  }>
> {
  const { data: templates, error: templateError } = await supabase
    .from("prompt_templates")
    .select("id,name,scenario,weight")
    .order("updated_at", { ascending: false })
  if (templateError) throw templateError

  const { data: feedbackRows, error: feedbackError } = await supabase
    .from("prompt_feedback")
    .select("prompt_template_id,outcome")
  if (feedbackError) throw feedbackError

  const countMap = new Map<string, { success: number; fail: number }>()
  ;(feedbackRows || []).forEach((row) => {
    const key = row.prompt_template_id
    if (!key) return
    const current = countMap.get(key) || { success: 0, fail: 0 }
    if (row.outcome === "success") current.success += 1
    if (row.outcome === "fail") current.fail += 1
    countMap.set(key, current)
  })

  return (templates || []).map((row) => {
    const current = countMap.get(row.id) || { success: 0, fail: 0 }
    return {
      templateId: row.id,
      name: row.name,
      scenario: row.scenario as AppScenario,
      weight: Number(row.weight || 1),
      success: current.success,
      fail: current.fail
    }
  })
}
