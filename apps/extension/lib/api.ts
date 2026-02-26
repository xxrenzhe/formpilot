import type { GenerateRequest, UsageSummary, UserPersona } from "@formpilot/shared"
import { getAppConfig, getAuthState, setPlan } from "./storage"
import { refreshSessionIfNeeded } from "./supabase"

async function getAuthHeader(): Promise<string | null> {
  const token = await refreshSessionIfNeeded()
  if (!token) return null
  return `Bearer ${token}`
}

export async function fetchUsage(): Promise<UsageSummary | null> {
  const config = await getAppConfig()
  const authHeader = await getAuthHeader()
  if (!authHeader) return null

  const response = await fetch(`${config.apiBaseUrl}/api/usage`, {
    headers: {
      Authorization: authHeader
    }
  })
  if (!response.ok) {
    return null
  }
  const data = (await response.json()) as UsageSummary
  await setPlan(data.plan)
  return data
}

export async function fetchPersonas(): Promise<UserPersona[]> {
  const config = await getAppConfig()
  const authHeader = await getAuthHeader()
  if (!authHeader) return []

  const response = await fetch(`${config.apiBaseUrl}/api/personas`, {
    headers: {
      Authorization: authHeader
    }
  })
  if (!response.ok) {
    return []
  }
  const data = (await response.json()) as { personas: UserPersona[] }
  return data.personas
}

export async function createPersona(persona: Omit<UserPersona, "id">): Promise<UserPersona | null> {
  const config = await getAppConfig()
  const authHeader = await getAuthHeader()
  if (!authHeader) return null

  const response = await fetch(`${config.apiBaseUrl}/api/personas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader
    },
    body: JSON.stringify(persona)
  })

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as { persona: UserPersona }
  return data.persona
}

export async function updatePersona(id: string, persona: Omit<UserPersona, "id">): Promise<UserPersona | null> {
  const config = await getAppConfig()
  const authHeader = await getAuthHeader()
  if (!authHeader) return null

  const response = await fetch(`${config.apiBaseUrl}/api/personas/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader
    },
    body: JSON.stringify(persona)
  })

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as { persona: UserPersona }
  return data.persona
}

export async function deletePersona(id: string): Promise<boolean> {
  const config = await getAppConfig()
  const authHeader = await getAuthHeader()
  if (!authHeader) return false

  const response = await fetch(`${config.apiBaseUrl}/api/personas/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: authHeader
    }
  })

  return response.ok
}

export async function openCheckout(price: "pro-month" | "pro-year"): Promise<string | null> {
  const config = await getAppConfig()
  const authHeader = await getAuthHeader()
  if (!authHeader) return null

  const response = await fetch(`${config.apiBaseUrl}/api/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader
    },
    body: JSON.stringify({ price })
  })

  if (!response.ok) return null
  const data = (await response.json()) as { url: string }
  return data.url
}

export async function generateContent(
  payload: GenerateRequest,
  options: {
    onToken: (token: string) => void
    onError: (message: string, upgradeUrl?: string) => void
    onMeta?: (meta: { contextTotal?: number; contextOmitted?: number }) => void
    byokKey?: string
  }
): Promise<void> {
  const config = await getAppConfig()
  const authHeader = await getAuthHeader()
  if (!authHeader) {
    options.onError("未登录")
    return
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: authHeader
  }
  if (options.byokKey) {
    headers["x-byok-key"] = options.byokKey
  }

  const response = await fetch(`${config.apiBaseUrl}/api/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  })

  if (!response.ok || !response.body) {
    const text = await response.text()
    try {
      const data = JSON.parse(text) as { message?: string; upgradeUrl?: string }
      options.onError(data.message || "生成失败", data.upgradeUrl)
    } catch {
      options.onError(text || "生成失败")
    }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let currentEvent: string = "message"

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let index = buffer.indexOf("\n")
    while (index !== -1) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)

      const trimmed = line.trim()
      if (!trimmed) {
        currentEvent = "message"
        index = buffer.indexOf("\n")
        continue
      }

      if (trimmed.startsWith("event:")) {
        currentEvent = trimmed.replace(/^event:\s*/, "")
      } else if (trimmed.startsWith("data:")) {
        const data = trimmed.replace(/^data:\s*/, "")
        if (data === "[DONE]") return
        if (currentEvent === "error") {
          options.onError(data || "生成失败")
          return
        }
        if (currentEvent === "meta") {
          try {
            const parsed = JSON.parse(data) as { contextTotal?: number; contextOmitted?: number }
            options.onMeta?.(parsed)
          } catch {
            // ignore
          }
          currentEvent = "message"
          index = buffer.indexOf("\n")
          continue
        }
        options.onToken(data)
      }
      index = buffer.indexOf("\n")
    }
  }
}
