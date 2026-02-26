import "dotenv/config"

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 8787),
  appBaseUrl: process.env.APP_BASE_URL || "https://formpilot.ai",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripePriceProMonth: process.env.STRIPE_PRICE_PRO_MONTH || "",
  stripePriceProYear: process.env.STRIPE_PRICE_PRO_YEAR || "",
  aiProvider: process.env.AI_PROVIDER || "openai",
  aiBaseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
  aiApiKey: process.env.AI_API_KEY || "",
  aiModel: process.env.AI_MODEL || "gpt-4o-mini"
}

export function requireEnv(value: string, name: string): string {
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`)
  }
  return value
}
