import { supabase } from "./db"

const BOOTSTRAP_ADMIN_USERNAME = "formpilot"
const BOOTSTRAP_ADMIN_EMAIL = "formpilot@formpilot.local"
const BOOTSTRAP_ADMIN_PASSWORD = "LYTu@TDmw345Jn1AZg#DRjinHhjk"

function normalizeEmail(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
}

async function findAuthUser(target: { email: string; username: string }): Promise<{
  id: string
  email: string | null
  user_metadata?: Record<string, unknown>
  app_metadata?: Record<string, unknown>
} | null> {
  const targetEmail = normalizeEmail(target.email)
  const targetUsername = target.username.trim().toLowerCase()
  const perPage = 200

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage
    })

    if (error) {
      throw error
    }

    const users = data?.users || []
    const hit = users.find((user) => {
      const metadata = (user.user_metadata as Record<string, unknown> | undefined) || {}
      const metadataUsername = String(metadata.username || "")
        .trim()
        .toLowerCase()
      return normalizeEmail(user.email) === targetEmail || metadataUsername === targetUsername
    })
    if (hit) {
      return {
        id: hit.id,
        email: hit.email ?? null,
        user_metadata: (hit.user_metadata as Record<string, unknown> | undefined) || {},
        app_metadata: (hit.app_metadata as Record<string, unknown> | undefined) || {}
      }
    }

    if (users.length < perPage) break
  }

  return null
}

async function ensureUsersTableAdmin(userId: string, email: string): Promise<void> {
  const { data: existing, error: queryError } = await supabase
    .from("users")
    .select("id,role,email")
    .eq("id", userId)
    .maybeSingle()

  if (queryError) throw queryError

  if (!existing) {
    const { error: insertError } = await supabase.from("users").insert({
      id: userId,
      email,
      role: "admin",
      credits: 100000
    })

    if (insertError) throw insertError
    return
  }

  const updatePayload: Record<string, unknown> = {}
  if ((existing.role || "") !== "admin") {
    updatePayload.role = "admin"
  }
  if ((existing.email || "") !== email) {
    updatePayload.email = email
  }

  if (!Object.keys(updatePayload).length) {
    return
  }

  const { error: updateError } = await supabase.from("users").update(updatePayload).eq("id", userId)
  if (updateError) throw updateError
}

export async function ensureBootstrapAdmin(): Promise<void> {
  const existing = await findAuthUser({
    email: BOOTSTRAP_ADMIN_EMAIL,
    username: BOOTSTRAP_ADMIN_USERNAME
  })

  if (!existing) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: BOOTSTRAP_ADMIN_EMAIL,
      password: BOOTSTRAP_ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: {
        username: BOOTSTRAP_ADMIN_USERNAME,
        source: "bootstrap"
      },
      app_metadata: {
        role: "admin"
      }
    })

    if (error || !data.user) {
      throw error || new Error("创建管理员账号失败")
    }

    await ensureUsersTableAdmin(data.user.id, BOOTSTRAP_ADMIN_EMAIL)
    console.log(`[bootstrap-admin] created admin username=${BOOTSTRAP_ADMIN_USERNAME}`)
    return
  }

  const { error: resetError } = await supabase.auth.admin.updateUserById(existing.id, {
    ...(normalizeEmail(existing.email) !== normalizeEmail(BOOTSTRAP_ADMIN_EMAIL)
      ? { email: BOOTSTRAP_ADMIN_EMAIL, email_confirm: true }
      : {}),
    password: BOOTSTRAP_ADMIN_PASSWORD,
    user_metadata: {
      ...(existing.user_metadata || {}),
      username: BOOTSTRAP_ADMIN_USERNAME
    },
    app_metadata: {
      ...(existing.app_metadata || {}),
      role: "admin"
    }
  })

  if (resetError) throw resetError

  await ensureUsersTableAdmin(existing.id, BOOTSTRAP_ADMIN_EMAIL)
  console.log(`[bootstrap-admin] reset password for username=${BOOTSTRAP_ADMIN_USERNAME}`)
}
