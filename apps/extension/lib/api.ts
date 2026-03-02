import type {
  ComplianceProfile,
  GenerateRequest,
  GenerateErrorResponse,
  MetricEventPayload,
  UsageSummary
} from "@formpilot/shared"
import { getAppConfig, getDeviceId } from "./storage"
import { refreshSessionIfNeeded } from "./supabase"

export interface GenerateMeta {
  scenario?: string
  creditsCost?: number
  costTier?: string
  templateId?: string | null
  missingFields?: string[]
}

interface ProxyResponse {
  ok: boolean
  status: number
  statusText: string
  body: string
}

async function getAuthHeader(): Promise<string | null> {
  const token = await refreshSessionIfNeeded()
  if (!token) return null
  return `Bearer ${token}`
}

function proxyFetch(input: {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
}): Promise<ProxyResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: "proxyFetch",
        request: {
          url: input.url,
          method: input.method || "GET",
          headers: input.headers || {},
          body: input.body
        }
      },
      (response: ProxyResponse) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        resolve(response)
      }
    )
  })
}

async function buildHeaders(contentType = false): Promise<Record<string, string> | null> {
  const authHeader = await getAuthHeader()
  if (!authHeader) return null
  const deviceId = await getDeviceId()
  const headers: Record<string, string> = {
    Authorization: authHeader,
    "x-device-id": deviceId
  }
  if (contentType) {
    headers["Content-Type"] = "application/json"
  }
  return headers
}

export async function fetchUsage(): Promise<UsageSummary | null> {
  const config = await getAppConfig()
  const headers = await buildHeaders()
  if (!headers) return null

  const response = await proxyFetch({
    url: `${config.apiBaseUrl}/api/usage`,
    headers
  })
  if (!response.ok) return null

  const data = JSON.parse(response.body) as UsageSummary
  return data
}

export async function fetchComplianceProfile(): Promise<ComplianceProfile | null> {
  const config = await getAppConfig()
  const headers = await buildHeaders()
  if (!headers) return null

  const response = await proxyFetch({
    url: `${config.apiBaseUrl}/api/compliance-profile`,
    headers
  })
  if (!response.ok) return null
  const data = JSON.parse(response.body) as { profile: ComplianceProfile }
  return data.profile
}

export async function upsertComplianceProfile(profile: ComplianceProfile): Promise<ComplianceProfile> {
  const config = await getAppConfig()
  const headers = await buildHeaders(true)
  if (!headers) throw new Error("未登录")

  const response = await proxyFetch({
    url: `${config.apiBaseUrl}/api/compliance-profile`,
    method: "PUT",
    headers,
    body: JSON.stringify(profile)
  })

  if (!response.ok) {
    try {
      const data = JSON.parse(response.body) as { message?: string }
      throw new Error(data.message || "保存失败")
    } catch {
      throw new Error(response.body || "保存失败")
    }
  }

  return (JSON.parse(response.body) as { profile: ComplianceProfile }).profile
}

function parseErrorResponse(body: string): GenerateErrorResponse {
  try {
    return JSON.parse(body) as GenerateErrorResponse
  } catch {
    return {
      errorCode: "FORBIDDEN",
      message: body || "生成失败"
    }
  }
}

function isLikelyNetworkMessage(rawMessage: string): boolean {
  const message = rawMessage.trim().toLowerCase()
  if (!message) return false
  return (
    message.includes("network_error") ||
    message.includes("networkerror") ||
    message.includes("failed to fetch") ||
    message.includes("network connection") ||
    message.includes("load failed")
  )
}

function toHumanReadableGenerateError(input: {
  errorCode?: GenerateErrorResponse["errorCode"]
  message?: string
  status?: number
}): string {
  if (input.status === 0 || isLikelyNetworkMessage(input.message || "")) {
    return "网络中断，请重试"
  }

  switch (input.errorCode) {
    case "UNAUTHORIZED":
      return "请先登录后再试"
    case "INSUFFICIENT_CREDITS":
      return "额度不足，请先充值"
    case "INVALID_PARAMS":
      return "请求参数异常，请重试"
    case "USAGE_LIMIT":
      return "调用过于频繁，请稍后重试"
    case "MISSING_CONFIG":
      return "服务暂不可用，请稍后再试"
    case "MISSING_COMPLIANCE_PROFILE":
      return "请先补齐合规资料后再试"
    case "FORBIDDEN":
      return "请求被拒绝，请稍后再试"
    case "INVALID_CODE":
      return "充值码无效，请核对后重试"
    default:
      break
  }

  if (input.status === 401) return "请先登录后再试"
  if (input.status === 402) return "额度不足，请先充值"
  if (input.status === 429) return "调用过于频繁，请稍后重试"

  return "生成失败，请稍后重试"
}

export async function generateContent(
  payload: GenerateRequest,
  options: {
    onToken: (token: string) => void
    onError: (message: string, details?: GenerateErrorResponse) => void
    onMeta?: (meta: GenerateMeta) => void
  }
): Promise<void> {
  const config = await getAppConfig()
  const headers = await buildHeaders(true)
  if (!headers) {
    options.onError("请先登录后再试")
    return
  }

  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const port = chrome.runtime.connect({ name: "proxy-stream" })
  let buffer = ""
  let currentEvent = "message"
  let closed = false

  let onMessageRef: ((message: {
    requestId?: string
    type?: "response" | "error-response" | "chunk" | "done" | "stream-error"
    status?: number
    body?: string
    chunk?: string
    message?: string
  }) => void) | null = null

  const cleanup = () => {
    if (closed) return
    closed = true
    try {
      port.postMessage({
        action: "cancelStream",
        requestId
      })
    } catch {
      // ignore cancel errors
    }
    if (onMessageRef) {
      port.onMessage.removeListener(onMessageRef)
      onMessageRef = null
    }
    try {
      port.disconnect()
    } catch {
      // ignore disconnect errors
    }
  }

  const processLine = (rawLine: string): boolean => {
    const line = rawLine.trim()
    if (!line) {
      currentEvent = "message"
      return false
    }
    if (line.startsWith("event:")) {
      currentEvent = line.replace(/^event:\s*/, "")
      return false
    }
    if (!line.startsWith("data:")) return false

    const data = line.replace(/^data:\s*/, "")
    if (data === "[DONE]") {
      return true
    }
    if (currentEvent === "error") {
      options.onError(
        toHumanReadableGenerateError({
          message: data
        })
      )
      return true
    }
    if (currentEvent === "meta") {
      try {
        const meta = JSON.parse(data) as GenerateMeta
        options.onMeta?.(meta)
      } catch {
        // ignore malformed meta
      }
      currentEvent = "message"
      return false
    }

    options.onToken(data)
    return false
  }

  const processBuffer = (flush = false): boolean => {
    let index = buffer.indexOf("\n")
    while (index !== -1) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      if (processLine(line)) return true
      index = buffer.indexOf("\n")
    }

    if (flush && buffer) {
      const shouldStop = processLine(buffer)
      buffer = ""
      return shouldStop
    }

    return false
  }

  await new Promise<void>((resolve) => {
    const onMessage = (message: {
      requestId?: string
      type?: "response" | "error-response" | "chunk" | "done" | "stream-error"
      status?: number
      body?: string
      chunk?: string
      message?: string
    }) => {
      if (message.requestId !== requestId) return

      if (message.type === "error-response") {
        const parsed = parseErrorResponse(message.body || "")
        options.onError(
          toHumanReadableGenerateError({
            errorCode: parsed.errorCode,
            message: parsed.message,
            status: message.status
          }),
          parsed
        )
        cleanup()
        resolve()
        return
      }

      if (message.type === "stream-error") {
        options.onError(
          toHumanReadableGenerateError({
            message: message.message,
            status: message.status
          })
        )
        cleanup()
        resolve()
        return
      }

      if (message.type === "chunk") {
        buffer += message.chunk || ""
        const shouldStop = processBuffer(false)
        if (shouldStop) {
          cleanup()
          resolve()
        }
        return
      }

      if (message.type === "done") {
        processBuffer(true)
        cleanup()
        resolve()
      }
    }

    onMessageRef = onMessage
    port.onMessage.addListener(onMessage)
    port.postMessage({
      action: "startStream",
      requestId,
      request: {
        url: `${config.apiBaseUrl}/api/generate`,
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      }
    })
  })
}

export async function sendMetric(payload: MetricEventPayload): Promise<void> {
  const config = await getAppConfig()
  const headers = await buildHeaders(true)
  if (!headers) return

  await proxyFetch({
    url: `${config.apiBaseUrl}/api/metrics`,
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  })
}

export async function sendPromptFeedback(payload: {
  templateId: string
  scenario: "general" | "ads_compliance"
  outcome: "success" | "fail"
}): Promise<void> {
  const config = await getAppConfig()
  const headers = await buildHeaders(true)
  if (!headers) throw new Error("未登录")

  const response = await proxyFetch({
    url: `${config.apiBaseUrl}/api/prompt-feedback`,
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    throw new Error("反馈提交失败")
  }
}

export async function sendAppealFeedback(payload: {
  templateId: string
  scenario: "general" | "ads_compliance"
  outcome: "success" | "fail"
}): Promise<boolean> {
  const config = await getAppConfig()
  const headers = await buildHeaders(true)
  if (!headers) throw new Error("未登录")

  const response = await proxyFetch({
    url: `${config.apiBaseUrl}/api/appeal-feedback`,
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    throw new Error("过审结果提交失败")
  }

  try {
    const data = JSON.parse(response.body) as { recorded?: boolean }
    return Boolean(data.recorded)
  } catch {
    return true
  }
}

export async function redeemInvite(code: string): Promise<{ creditsAdded: number; credits: number }> {
  const config = await getAppConfig()
  const headers = await buildHeaders(true)
  if (!headers) {
    throw new Error("未登录")
  }

  const response = await proxyFetch({
    url: `${config.apiBaseUrl}/api/invites/redeem`,
    method: "POST",
    headers,
    body: JSON.stringify({ code })
  })

  if (!response.ok) {
    try {
      const data = JSON.parse(response.body) as { message?: string }
      throw new Error(data.message || "兑换失败")
    } catch {
      throw new Error(response.body || "兑换失败")
    }
  }

  return JSON.parse(response.body) as { creditsAdded: number; credits: number }
}
