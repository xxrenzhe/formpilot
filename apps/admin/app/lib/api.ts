const BFF_URL = process.env.NEXT_PUBLIC_BFF_URL || "http://localhost:8787"

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BFF_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {})
    }
  })

  if (!response.ok) {
    const text = await response.text()
    try {
      const data = JSON.parse(text) as { message?: string }
      throw new ApiError(data.message || "请求失败", response.status)
    } catch {
      throw new ApiError(text || "请求失败", response.status)
    }
  }

  return (await response.json()) as T
}

export interface AdminUserRow {
  id: string
  email: string | null
  credits: number
  createdAt: string | null
  role?: string | null
  lastUsage?: string | null
}

export interface UsersResponse {
  users: AdminUserRow[]
  page: number
  pageSize: number
  total: number
}

export interface InviteRow {
  code: string
  batchNote: string | null
  credits: number
  createdAt: string | null
  redeemedAt: string | null
  redeemedBy: string | null
}

export interface InviteBatchRow {
  batchNote: string
  credits: number
  total: number
  redeemed: number
  remaining: number
}

export interface InvitesResponse {
  invites: InviteRow[]
  batches: InviteBatchRow[]
  page: number
  pageSize: number
  total: number
}

export interface PromptPerformanceRow {
  templateId: string
  name: string
  scenario: "general" | "ads_compliance"
  weight: number
  success: number
  fail: number
}

export interface PromptTemplateRow {
  id: string
  scenario: "general" | "ads_compliance"
  name: string
  templateBody: string
  weight: number
  active: boolean
  updatedAt: string
}

export interface AnalyticsOverview {
  daily: Array<{
    day: string
    ads_generated: number
    generation_success: number
    feedback_success: number
    feedback_fail: number
  }>
  funnel: {
    generatedAppeals: number
    successFeedback: number
    failFeedback: number
    feedbackRate: number
    approvalSignal: number
  }
  promptPerformance: PromptPerformanceRow[]
}

export interface SystemHealth {
  bff: { ok: boolean }
  supabase: { ok: boolean; error?: string }
  promptTemplates: { active: number }
  recentErrors: number
}

export async function fetchUsers(token: string, params: { query?: string; page?: number; pageSize?: number }): Promise<UsersResponse> {
  const searchParams = new URLSearchParams()
  if (params.query) searchParams.set("query", params.query)
  if (params.page) searchParams.set("page", String(params.page))
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize))
  const queryString = searchParams.toString()
  const path = queryString ? `/api/admin/users?${queryString}` : "/api/admin/users"
  return apiFetch<UsersResponse>(path, token)
}

export async function updateUserCredits(
  token: string,
  userId: string,
  payload: { credits: number }
): Promise<{ success: boolean }> {
  return apiFetch(`/api/admin/users/${userId}/credits`, token, {
    method: "PUT",
    body: JSON.stringify(payload)
  })
}

export async function fetchInvites(
  token: string,
  params: { status?: string; batchNote?: string; page?: number; pageSize?: number }
): Promise<InvitesResponse> {
  const searchParams = new URLSearchParams()
  if (params.status) searchParams.set("status", params.status)
  if (params.batchNote) searchParams.set("batchNote", params.batchNote)
  if (params.page) searchParams.set("page", String(params.page))
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize))
  const queryString = searchParams.toString()
  const path = queryString ? `/api/admin/invites?${queryString}` : "/api/admin/invites"
  return apiFetch<InvitesResponse>(path, token)
}

export async function generateInvites(
  token: string,
  payload: { count: number; credits: number; batchNote: string }
): Promise<{ codes: string[]; rawCodes: string[] }> {
  return apiFetch(`/api/admin/invites/generate`, token, {
    method: "POST",
    body: JSON.stringify(payload)
  })
}

export async function fetchAnalytics(token: string): Promise<AnalyticsOverview> {
  return apiFetch("/api/admin/analytics/overview", token)
}

export async function fetchSystemHealth(token: string): Promise<SystemHealth> {
  return apiFetch("/api/admin/system/health", token)
}

export async function fetchPromptTemplates(
  token: string,
  scenario?: "general" | "ads_compliance"
): Promise<PromptTemplateRow[]> {
  const query = scenario ? `?scenario=${scenario}` : ""
  const result = await apiFetch<{ prompts: PromptTemplateRow[] }>(`/api/admin/prompts${query}`, token)
  return result.prompts
}

export async function createPromptTemplate(
  token: string,
  payload: {
    scenario: "general" | "ads_compliance"
    name: string
    templateBody: string
    weight: number
    active: boolean
  }
): Promise<PromptTemplateRow> {
  const result = await apiFetch<{ prompt: PromptTemplateRow }>("/api/admin/prompts", token, {
    method: "POST",
    body: JSON.stringify(payload)
  })
  return result.prompt
}

export async function updatePromptTemplate(
  token: string,
  id: string,
  payload: {
    name: string
    templateBody: string
    weight: number
    active: boolean
  }
): Promise<PromptTemplateRow> {
  const result = await apiFetch<{ prompt: PromptTemplateRow }>(`/api/admin/prompts/${id}`, token, {
    method: "PUT",
    body: JSON.stringify(payload)
  })
  return result.prompt
}

export async function fetchPromptPerformance(token: string): Promise<PromptPerformanceRow[]> {
  const result = await apiFetch<{ rows: PromptPerformanceRow[] }>("/api/admin/prompts/performance", token)
  return result.rows
}

export async function runPromptSandbox(
  token: string,
  payload: {
    scenario: "general" | "ads_compliance"
    templateBody: string
    userHint: string
    sampleGlobalContext: string
  }
): Promise<{ output: string }> {
  return apiFetch("/api/admin/prompts/sandbox", token, {
    method: "POST",
    body: JSON.stringify(payload)
  })
}
