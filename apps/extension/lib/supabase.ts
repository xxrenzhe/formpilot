import { createClient, type Session } from "@supabase/supabase-js"
import { getAuthState, setAuthState } from "./storage"

const supabaseUrl = process.env.PLASMO_PUBLIC_SUPABASE_URL || ""
const supabaseAnonKey = process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY || ""

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    flowType: "implicit"
  }
})

function toAuthState(session: Session) {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at || 0,
    email: session.user.email || "",
    plan: "unknown" as const
  }
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(error?.message || "登录失败")
  }
  await setAuthState(toAuthState(data.session))
}

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error || !data.session) {
    throw new Error(error?.message || "注册失败")
  }
  await setAuthState(toAuthState(data.session))
}

export async function signInWithGoogle(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: chrome.runtime.getURL("options/index.html")
    }
  })
  if (error) {
    throw new Error(error.message)
  }
  if (data?.url) {
    chrome.tabs.create({ url: data.url })
  }
}

export async function consumeOAuthRedirect(): Promise<boolean> {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : ""
  if (!hash) return false
  const params = new URLSearchParams(hash)
  const accessToken = params.get("access_token")
  const refreshToken = params.get("refresh_token")
  const expiresIn = params.get("expires_in")
  const tokenType = params.get("token_type")

  if (!accessToken || tokenType !== "bearer") return false

  const expiresAt = expiresIn ? Math.floor(Date.now() / 1000) + Number(expiresIn) : 0
  let email = ""
  try {
    const { data } = await supabase.auth.getUser(accessToken)
    email = data.user?.email || ""
  } catch {
    email = ""
  }

  await setAuthState({
    accessToken,
    refreshToken: refreshToken || "",
    expiresAt,
    email,
    plan: "unknown"
  })

  const cleanUrl = window.location.origin + window.location.pathname
  window.history.replaceState({}, document.title, cleanUrl)
  return true
}
export async function refreshSessionIfNeeded(): Promise<string | null> {
  const auth = await getAuthState()
  if (!auth) return null
  const now = Math.floor(Date.now() / 1000)
  if (auth.expiresAt > now + 60) {
    return auth.accessToken
  }

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: auth.refreshToken
  })
  if (error || !data.session) {
    await setAuthState(null)
    return null
  }
  const next = toAuthState(data.session)
  await setAuthState({ ...next, plan: auth.plan })
  return next.accessToken
}

export async function signOut(): Promise<void> {
  await setAuthState(null)
}
