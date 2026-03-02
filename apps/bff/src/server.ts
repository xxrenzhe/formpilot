import { Hono } from "hono"
import { cors } from "hono/cors"
import { serve } from "@hono/node-server"
import { env } from "./config"
import { runStartupMigrations } from "./migrations"
import { ensureBootstrapAdmin } from "./bootstrapAdmin"
import { generateHandler } from "./routes/generate"
import { usageHandler } from "./routes/usage"
import { metricsHandler } from "./routes/metrics"
import { redeemInviteHandler } from "./routes/invites"
import { generateInvitesHandler } from "./routes/invitesAdmin"
import { listAdminUsersHandler, getAdminUserHandler } from "./routes/adminUsers"
import { updateAdminCreditsHandler } from "./routes/adminCredits"
import { listAdminInvitesHandler, exportAdminInvitesHandler } from "./routes/adminInvites"
import { adminAnalyticsHandler } from "./routes/adminAnalytics"
import { adminSystemHealthHandler } from "./routes/adminSystem"
import { getComplianceProfileHandler, upsertComplianceProfileHandler } from "./routes/compliance"
import { promptFeedbackHandler } from "./routes/promptFeedback"
import {
  createAdminPromptHandler,
  listAdminPromptsHandler,
  promptPerformanceHandler,
  updateAdminPromptHandler
} from "./routes/adminPrompts"
import { promptSandboxHandler } from "./routes/adminPromptSandbox"

const app = new Hono()

const corsOrigin =
  env.corsOrigins === "*" || !env.corsOrigins
    ? "*"
    : env.corsOrigins
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)

app.use(
  "*",
  cors({
    origin: corsOrigin,
    allowHeaders: ["Content-Type", "Authorization", "x-admin-token", "x-device-id"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    maxAge: 86400
  })
)

app.get("/health", (c) => c.json({ status: "ok" }))

app.get("/api/usage", usageHandler)
app.post("/api/generate", generateHandler)
app.post("/api/metrics", metricsHandler)
app.post("/api/invites/redeem", redeemInviteHandler)
app.get("/api/compliance-profile", getComplianceProfileHandler)
app.put("/api/compliance-profile", upsertComplianceProfileHandler)
app.post("/api/prompt-feedback", promptFeedbackHandler)
app.post("/api/admin/invites/generate", generateInvitesHandler)
app.get("/api/admin/users", listAdminUsersHandler)
app.get("/api/admin/users/:id", getAdminUserHandler)
app.put("/api/admin/users/:id/credits", updateAdminCreditsHandler)
app.get("/api/admin/invites", listAdminInvitesHandler)
app.get("/api/admin/invites/export", exportAdminInvitesHandler)
app.get("/api/admin/analytics/overview", adminAnalyticsHandler)
app.get("/api/admin/system/health", adminSystemHealthHandler)
app.get("/api/admin/prompts", listAdminPromptsHandler)
app.post("/api/admin/prompts", createAdminPromptHandler)
app.put("/api/admin/prompts/:id", updateAdminPromptHandler)
app.get("/api/admin/prompts/performance", promptPerformanceHandler)
app.post("/api/admin/prompts/sandbox", promptSandboxHandler)

async function startServer(): Promise<void> {
  await runStartupMigrations()
  await ensureBootstrapAdmin()

  serve({
    fetch: app.fetch,
    port: env.port
  })

  console.log(`FormPilot BFF 已启动: http://localhost:${env.port}`)
}

void startServer().catch((error) => {
  console.error("[startup] failed to start bff:", error)
  process.exit(1)
})
