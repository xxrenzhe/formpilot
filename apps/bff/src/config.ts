import "dotenv/config"

function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 8787),
  appBaseUrl: process.env.APP_BASE_URL || "https://formpilot.ai",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  supabaseDbUrl: process.env.SUPABASE_DB_URL || "",
  adminToken: process.env.ADMIN_TOKEN || "",
  corsOrigins: process.env.CORS_ORIGINS || "*",
  aiProvider: process.env.AI_PROVIDER || "openai",
  aiBaseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
  aiApiKey: process.env.AI_API_KEY || "",
  aiModel: process.env.AI_MODEL || "gpt-4o-mini",
  aiModelGeneral: process.env.AI_MODEL_GENERAL || "",
  aiModelAds: process.env.AI_MODEL_ADS || "",
  freeSignupCredits: Number(process.env.FREE_SIGNUP_CREDITS || 20),
  autoRunMigrations: asBoolean(process.env.AUTO_RUN_MIGRATIONS, true),
  migrationsDir: process.env.MIGRATIONS_DIR || "infra/supabase/migrations",
  migrationDbSsl: asBoolean(process.env.MIGRATION_DB_SSL, true),
  migrationDbSslRejectUnauthorized: asBoolean(process.env.MIGRATION_DB_SSL_REJECT_UNAUTHORIZED, false)
}

export function requireEnv(value: string, name: string): string {
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`)
  }
  return value
}
