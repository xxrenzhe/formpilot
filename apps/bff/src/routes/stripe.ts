import type { Context } from "hono"
import Stripe from "stripe"
import { z } from "zod"
import { getAuthUser } from "../auth"
import { env, requireEnv } from "../config"
import { jsonError } from "../response"
import { findUserByStripeCustomerId, getOrCreateUserRecord, updateUserPlan } from "../user"

function getStripeClient(): Stripe {
  const key = requireEnv(env.stripeSecretKey, "STRIPE_SECRET_KEY")
  return new Stripe(key, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion })
}

const checkoutSchema = z.object({
  price: z.enum(["pro-month", "pro-year"])
})

function getPriceId(price: "pro-month" | "pro-year"): string {
  if (price === "pro-month") {
    return requireEnv(env.stripePriceProMonth, "STRIPE_PRICE_PRO_MONTH")
  }
  return requireEnv(env.stripePriceProYear, "STRIPE_PRICE_PRO_YEAR")
}

export async function createCheckoutHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, { errorCode: "UNAUTHORIZED", message: "未登录" })
  }

  const payload = checkoutSchema.safeParse(await c.req.json())
  if (!payload.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const userRecord = await getOrCreateUserRecord(authUser.id, authUser.email)
  const stripe = getStripeClient()
  const priceId = getPriceId(payload.data.price)

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    customer: userRecord.stripeCustomerId || undefined,
    customer_email: userRecord.stripeCustomerId ? undefined : authUser.email || undefined,
    success_url: `${env.appBaseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.appBaseUrl}/billing/cancel`,
    metadata: {
      userId: userRecord.id
    }
  })

  return c.json({ url: session.url })
}

export async function stripeWebhookHandler(c: Context): Promise<Response> {
  const stripe = getStripeClient()
  const signature = c.req.header("stripe-signature") || ""
  const webhookSecret = requireEnv(env.stripeWebhookSecret, "STRIPE_WEBHOOK_SECRET")
  const rawBody = await c.req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (error) {
    return new Response("Invalid signature", { status: 400 })
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.metadata?.userId
    if (userId && session.customer) {
      await updateUserPlan(userId, "pro", {
        stripeCustomerId: String(session.customer),
        stripeSubscriptionId: session.subscription ? String(session.subscription) : null
      })
    }
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription
    const stripeCustomerId = subscription.customer ? String(subscription.customer) : ""
    const isActive = subscription.status === "active" || subscription.status === "trialing"
    const user = await findUserByStripeCustomerId(stripeCustomerId)

    if (user) {
      await updateUserPlan(user.id, isActive ? "pro" : "free", {
        stripeCustomerId,
        stripeSubscriptionId: String(subscription.id),
        currentPeriodEnd: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null
      })
    }
  }

  return new Response("ok", { status: 200 })
}
