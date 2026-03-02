import type { AppScenario, PromptTemplate } from "@formpilot/shared"
import { supabase } from "./db"
import { env } from "./config"

const PROMPT_CACHE_TTL_MS = 15000
const FEEDBACK_DEDUP_WINDOW_MS = 10 * 60 * 1000
const promptPoolCache = new Map<AppScenario, { expiresAt: number; templates: PromptTemplate[] }>()

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

function getCachedPromptPool(scenario: AppScenario): PromptTemplate[] | null {
  const cached = promptPoolCache.get(scenario)
  if (!cached) return null
  if (cached.expiresAt < Date.now()) {
    promptPoolCache.delete(scenario)
    return null
  }
  return cached.templates
}

function setCachedPromptPool(scenario: AppScenario, templates: PromptTemplate[]): void {
  promptPoolCache.set(scenario, {
    templates,
    expiresAt: Date.now() + PROMPT_CACHE_TTL_MS
  })
}

function invalidatePromptPoolCache(scenario?: AppScenario): void {
  if (scenario) {
    promptPoolCache.delete(scenario)
    return
  }
  promptPoolCache.clear()
}

async function listActivePromptTemplates(scenario: AppScenario): Promise<PromptTemplate[]> {
  const cached = getCachedPromptPool(scenario)
  if (cached) return cached

  const { data, error } = await supabase
    .from("prompt_templates")
    .select("id,scenario,name,template_body,weight,active,updated_at")
    .eq("scenario", scenario)
    .eq("active", true)
    .order("updated_at", { ascending: false })

  if (error) throw error
  const templates = (data || []).map(mapTemplate)
  setCachedPromptPool(scenario, templates)
  return templates
}

export async function getWeightedPromptTemplate(scenario: AppScenario): Promise<PromptTemplate | null> {
  const templates = await listActivePromptTemplates(scenario)
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
  const template = mapTemplate(data)
  invalidatePromptPoolCache(template.scenario)
  return template
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
  const template = mapTemplate(data)
  invalidatePromptPoolCache(template.scenario)
  return template
}

export async function recordPromptFeedback(input: {
  userId: string
  templateId: string
  scenario: AppScenario
  outcome: "success" | "fail"
  note?: string
}): Promise<boolean> {
  const { data: latestFeedbackRows, error: latestFeedbackError } = await supabase
    .from("prompt_feedback")
    .select("outcome,created_at")
    .eq("user_id", input.userId)
    .eq("prompt_template_id", input.templateId)
    .order("created_at", { ascending: false })
    .limit(1)

  if (latestFeedbackError) throw latestFeedbackError

  const latestFeedback = latestFeedbackRows?.[0]
  const latestFeedbackTs = latestFeedback?.created_at ? new Date(latestFeedback.created_at).getTime() : 0
  if (
    latestFeedback?.outcome === input.outcome &&
    Number.isFinite(latestFeedbackTs) &&
    Date.now() - latestFeedbackTs < FEEDBACK_DEDUP_WINDOW_MS
  ) {
    return false
  }

  const { error } = await supabase.from("prompt_feedback").insert({
    user_id: input.userId,
    prompt_template_id: input.templateId,
    scenario: input.scenario,
    outcome: input.outcome,
    note: input.note || null
  })
  if (error) throw error

  if (!env.promptAutoWeightEnabled) {
    return true
  }

  const delta = input.outcome === "success" ? env.promptWeightDeltaAccept : env.promptWeightDeltaReject
  const { data: row, error: queryError } = await supabase
    .from("prompt_templates")
    .select("weight")
    .eq("id", input.templateId)
    .maybeSingle()
  if (queryError) throw queryError
  if (!row) return true

  const nextWeight = Math.max(0.1, Math.min(100, Number(row.weight || 1) + delta))
  const { error: updateError } = await supabase
    .from("prompt_templates")
    .update({ weight: nextWeight, updated_at: new Date().toISOString() })
    .eq("id", input.templateId)
  if (updateError) throw updateError
  invalidatePromptPoolCache(input.scenario)
  return true
}

export async function getPromptPerformance(): Promise<
  Array<{
    templateId: string
    name: string
    scenario: AppScenario
    weight: number
    success: number
    fail: number
    generated: number
    generationSuccess: number
    generationFail: number
    generationSuccessRate: number
    feedbackTotal: number
    feedbackCoverage: number
    adoptionRate: number
    qualityScore: number
    confidenceLevel: "low" | "medium" | "high"
    actionSuggestion: "collect_more_data" | "increase_weight" | "decrease_weight" | "hold"
    suggestedWeight: number
    suggestedDelta: number
  }>
> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: templates, error: templateError } = await supabase
    .from("prompt_templates")
    .select("id,name,scenario,weight")
    .order("updated_at", { ascending: false })
  if (templateError) throw templateError

  const { data: feedbackRows, error: feedbackError } = await supabase
    .from("prompt_feedback")
    .select("prompt_template_id,outcome,created_at")
    .gte("created_at", since)
  if (feedbackError) throw feedbackError

  const { data: usageRows, error: usageError } = await supabase
    .from("usage_logs")
    .select("prompt_template_id,success,timestamp")
    .eq("request_type", "generate")
    .gte("timestamp", since)
  if (usageError) throw usageError

  const countMap = new Map<string, { success: number; fail: number }>()
  ;(feedbackRows || []).forEach((row) => {
    const key = row.prompt_template_id
    if (!key) return
    const current = countMap.get(key) || { success: 0, fail: 0 }
    if (row.outcome === "success") current.success += 1
    if (row.outcome === "fail") current.fail += 1
    countMap.set(key, current)
  })

  const usageMap = new Map<string, { generated: number; generationSuccess: number; generationFail: number }>()
  ;(usageRows || []).forEach((row) => {
    const key = row.prompt_template_id
    if (!key) return
    const current = usageMap.get(key) || { generated: 0, generationSuccess: 0, generationFail: 0 }
    current.generated += 1
    if (row.success) current.generationSuccess += 1
    else current.generationFail += 1
    usageMap.set(key, current)
  })

  return (templates || []).map((row) => {
    const current = countMap.get(row.id) || { success: 0, fail: 0 }
    const usage = usageMap.get(row.id) || { generated: 0, generationSuccess: 0, generationFail: 0 }
    const feedbackTotal = current.success + current.fail
    const feedbackCoverage = usage.generated > 0 ? feedbackTotal / usage.generated : 0
    const adoptionRate = feedbackTotal > 0 ? current.success / feedbackTotal : 0
    const generationSuccessRate = usage.generated > 0 ? usage.generationSuccess / usage.generated : 0
    const qualityScore =
      feedbackTotal > 0 ? adoptionRate * 0.7 + generationSuccessRate * 0.3 : generationSuccessRate * 0.5
    const confidenceLevel =
      feedbackTotal >= 20 || usage.generated >= 80 ? "high" : feedbackTotal >= 8 || usage.generated >= 30 ? "medium" : "low"
    const actionSuggestion =
      feedbackTotal < 5 || usage.generated < 10
        ? "collect_more_data"
        : adoptionRate >= 0.75 && generationSuccessRate >= 0.9
          ? "increase_weight"
          : adoptionRate <= 0.4 || generationSuccessRate < 0.75
            ? "decrease_weight"
            : "hold"
    const currentWeight = Number(row.weight || 1)
    const suggestedWeightRaw =
      actionSuggestion === "increase_weight"
        ? currentWeight * 1.15
        : actionSuggestion === "decrease_weight"
          ? currentWeight * 0.85
          : currentWeight
    const suggestedWeight = Math.max(0.1, Math.min(100, Number(suggestedWeightRaw.toFixed(2))))
    const suggestedDelta = Number((suggestedWeight - currentWeight).toFixed(2))
    return {
      templateId: row.id,
      name: row.name,
      scenario: row.scenario as AppScenario,
      weight: currentWeight,
      success: current.success,
      fail: current.fail,
      generated: usage.generated,
      generationSuccess: usage.generationSuccess,
      generationFail: usage.generationFail,
      generationSuccessRate,
      feedbackTotal,
      feedbackCoverage,
      adoptionRate,
      qualityScore,
      confidenceLevel,
      actionSuggestion,
      suggestedWeight,
      suggestedDelta
    }
  })
}
