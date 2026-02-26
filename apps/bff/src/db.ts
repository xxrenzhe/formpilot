import { createClient } from "@supabase/supabase-js"
import { env, requireEnv } from "./config"

const supabaseUrl = requireEnv(env.supabaseUrl, "SUPABASE_URL")
const supabaseKey = requireEnv(env.supabaseServiceKey, "SUPABASE_SERVICE_ROLE_KEY")

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
})
