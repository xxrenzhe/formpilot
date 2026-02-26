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
  plan: string
  currentPeriodEnd: string | null
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
  batchId: string | null
  createdAt: string | null
  redeemedAt: string | null
  redeemedBy: string | null
}

export interface InvitesResponse {
  invites: InviteRow[]
  page: number
  pageSize: number
  total: number
}

export interface AnalyticsOverview {
  daily: Array<{ day: string; panel_users: number; generate_users: number; copy_users: number; paywall_users: number }>
  funnel: {
    generateUsers: number
    copyUsers: number
    paywallUsers: number
    ahaRate: number
    paywallRate: number
    dau: number
    mau: number
    paidUsers: number
    paidConversionRate: number
  }
}

export interface SystemHealth {
  bff: { ok: boolean }
  supabase: { ok: boolean; error?: string }
  stripe: { ok: boolean; status: "ok" | "disabled" | "error"; error?: string }
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

export async function updateUserPlan(token: string, userId: string, payload: { plan: string; currentPeriodEnd?: string | null }): Promise<{ success: boolean }> {
  return apiFetch(`/api/admin/users/${userId}/plan`, token, {
    method: "PUT",
    body: JSON.stringify(payload)
  })
}

export async function fetchInvites(
  token: string,
  params: { status?: string; batchId?: string; page?: number; pageSize?: number }
): Promise<InvitesResponse> {
  const searchParams = new URLSearchParams()
  if (params.status) searchParams.set("status", params.status)
  if (params.batchId) searchParams.set("batchId", params.batchId)
  if (params.page) searchParams.set("page", String(params.page))
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize))
  const queryString = searchParams.toString()
  const path = queryString ? `/api/admin/invites?${queryString}` : "/api/admin/invites"
  return apiFetch<InvitesResponse>(path, token)
}

export async function generateInvites(token: string, payload: { count: number; batchId?: string }): Promise<{ codes: string[]; rawCodes: string[] }> {
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
