import { Storage } from "@plasmohq/storage"
import type { UserPlan, UserPersona } from "@formpilot/shared"

const storage = new Storage({ area: "local" })

export interface AuthState {
  accessToken: string
  refreshToken: string
  expiresAt: number
  email: string
  plan: UserPlan
}

export interface AppConfig {
  apiBaseUrl: string
  byokKey: string
}

const DEFAULT_CONFIG: AppConfig = {
  apiBaseUrl: process.env.PLASMO_PUBLIC_BFF_URL || "http://localhost:8787",
  byokKey: ""
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

export async function setPlan(plan: UserPlan): Promise<void> {
  const current = await getAuthState()
  if (!current) return
  await setAuthState({ ...current, plan })
}

export async function cachePersonas(personas: UserPersona[]): Promise<void> {
  await storage.set("personasCache", personas)
}

export async function getCachedPersonas(): Promise<UserPersona[]> {
  return (await storage.get<UserPersona[]>("personasCache")) || []
}
