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
    onError: (message: string) => void
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
    const message = await response.text()
    options.onError(message || "生成失败")
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let index = buffer.indexOf("\n")
    while (index !== -1) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)

      if (line.startsWith("data:")) {
        const data = line.replace(/^data:\s*/, "")
        if (data === "[DONE]") return
        options.onToken(data)
      }
      index = buffer.indexOf("\n")
    }
  }
}
