import { Hono } from "hono"
import { cors } from "hono/cors"
import { serve } from "@hono/node-server"
import { env } from "./config"
import { generateHandler } from "./routes/generate"
import { listPersonasHandler, createPersonaHandler, updatePersonaHandler, deletePersonaHandler } from "./routes/personas"
import { usageHandler } from "./routes/usage"
import { createCheckoutHandler, stripeWebhookHandler } from "./routes/stripe"
import { metricsHandler } from "./routes/metrics"
import { metricsDailyHandler } from "./routes/metricsDaily"
import { metricsFunnelHandler } from "./routes/metricsFunnel"
import { redeemInviteHandler } from "./routes/invites"
import { generateInvitesHandler } from "./routes/invitesAdmin"
import { listAdminUsersHandler, getAdminUserHandler } from "./routes/adminUsers"
import { updateAdminPlanHandler } from "./routes/adminPlans"
import { listAdminInvitesHandler, exportAdminInvitesHandler } from "./routes/adminInvites"
import { adminAnalyticsHandler } from "./routes/adminAnalytics"
import { adminSystemHealthHandler } from "./routes/adminSystem"

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
    allowHeaders: ["Content-Type", "Authorization", "x-byok-key", "x-admin-token"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    maxAge: 86400
  })
)

app.get("/health", (c) => c.json({ status: "ok" }))

app.get("/api/usage", usageHandler)
app.post("/api/generate", generateHandler)
app.get("/api/personas", listPersonasHandler)
app.post("/api/personas", createPersonaHandler)
app.put("/api/personas/:id", updatePersonaHandler)
app.delete("/api/personas/:id", deletePersonaHandler)
app.post("/api/checkout", createCheckoutHandler)
app.post("/api/metrics", metricsHandler)
app.get("/api/metrics/daily", metricsDailyHandler)
app.get("/api/metrics/funnel", metricsFunnelHandler)
app.post("/api/stripe/webhook", stripeWebhookHandler)
app.post("/api/invites/redeem", redeemInviteHandler)
app.post("/api/admin/invites/generate", generateInvitesHandler)
app.get("/api/admin/users", listAdminUsersHandler)
app.get("/api/admin/users/:id", getAdminUserHandler)
app.put("/api/admin/users/:id/plan", updateAdminPlanHandler)
app.get("/api/admin/invites", listAdminInvitesHandler)
app.get("/api/admin/invites/export", exportAdminInvitesHandler)
app.get("/api/admin/analytics/overview", adminAnalyticsHandler)
app.get("/api/admin/system/health", adminSystemHealthHandler)

serve({
  fetch: app.fetch,
  port: env.port
})

console.log(`FormPilot BFF 已启动: http://localhost:${env.port}`)
