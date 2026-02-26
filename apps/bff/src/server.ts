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

const app = new Hono()

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "x-byok-key"],
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
app.post("/api/stripe/webhook", stripeWebhookHandler)

serve({
  fetch: app.fetch,
  port: env.port
})

console.log(`FormPilot BFF 已启动: http://localhost:${env.port}`)
