import { Storage } from "@plasmohq/storage"

const storage = new Storage({ area: "local" })
const DEVICE_ID_KEY = "deviceId.v1"
const LONGDOC_DRAFT_KEY = "longDocDraft.v1"

export interface AuthState {
  accessToken: string
  refreshToken: string
  expiresAt: number
  email: string
}

export interface AppConfig {
  apiBaseUrl: string
}

export interface LongDocDraft {
  version: 1
  title: string
  goal: string
  reference: string
  updatedAt: number
}

const DEFAULT_CONFIG: AppConfig = {
  apiBaseUrl: process.env.PLASMO_PUBLIC_BFF_URL || "http://localhost:8787"
}

function createLocalDeviceId(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  let result = "fpdev_"
  for (let i = 0; i < bytes.length; i += 1) {
    result += charset[bytes[i] % charset.length]
  }
  return result
}

function readBackgroundDeviceId(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getDeviceId" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null)
        return
      }
      resolve(typeof response?.deviceId === "string" ? response.deviceId : null)
    })
  })
}

export async function getDeviceId(): Promise<string> {
  const local = await storage.get<string>(DEVICE_ID_KEY)
  if (local) return local

  const backgroundDeviceId = await readBackgroundDeviceId()
  const value = backgroundDeviceId || createLocalDeviceId()
  await storage.set(DEVICE_ID_KEY, value)
  return value
}

export async function getAppConfig(): Promise<AppConfig> {
  const stored = await storage.get<AppConfig>("appConfig")
  return {
    ...DEFAULT_CONFIG,
    ...(stored || {})
  }
}

export async function setAppConfig(config: AppConfig): Promise<void> {
  await storage.set("appConfig", config)
}

export async function getAuthState(): Promise<AuthState | null> {
  return (await storage.get<AuthState>("authState")) || null
}

export async function setAuthState(state: AuthState | null): Promise<void> {
  if (!state) {
    await storage.remove("authState")
    return
  }
  await storage.set("authState", state)
}

export async function getLongDocDraft(): Promise<LongDocDraft | null> {
  const stored = await storage.get<Partial<LongDocDraft>>(LONGDOC_DRAFT_KEY)
  if (!stored || stored.version !== 1) return null
  return {
    version: 1,
    title: typeof stored.title === "string" ? stored.title : "",
    goal: typeof stored.goal === "string" ? stored.goal : "",
    reference: typeof stored.reference === "string" ? stored.reference : "",
    updatedAt: typeof stored.updatedAt === "number" ? stored.updatedAt : Date.now()
  }
}

export async function setLongDocDraft(payload: {
  title: string
  goal: string
  reference: string
}): Promise<void> {
  await storage.set<LongDocDraft>(LONGDOC_DRAFT_KEY, {
    version: 1,
    title: payload.title.slice(0, 1000),
    goal: payload.goal.slice(0, 8000),
    reference: payload.reference.slice(0, 12000),
    updatedAt: Date.now()
  })
}

export async function clearLongDocDraft(): Promise<void> {
  await storage.remove(LONGDOC_DRAFT_KEY)
}
