import type { Context } from "hono"
import { getAuthUser } from "../auth"
import { jsonError } from "../response"
import { ensureDeviceCreditGrant, getOrCreateUserRecord } from "../user"
import { getLifetimeCreditsUsed } from "../usage"

function extractClientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for") ||
    c.req.header("x-real-ip") ||
    ""
  )
}

function extractUserAgent(c: Context): string {
  return c.req.header("user-agent") || ""
}

export async function usageHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, {
      errorCode: "UNAUTHORIZED",
      message: "未登录"
    })
  }

  let userRecord = await getOrCreateUserRecord(authUser.id, authUser.email)
  const [grantResult, lifetimeUsed] = await Promise.all([
    ensureDeviceCreditGrant({
      userId: userRecord.id,
      deviceId: c.req.header("x-device-id") || "",
      claimIp: extractClientIp(c),
      claimUa: extractUserAgent(c),
      currentCredits: userRecord.credits
    }),
    getLifetimeCreditsUsed(userRecord.id)
  ])
  userRecord = {
    ...userRecord,
    credits: grantResult.credits
  }

  const trialHint =
    grantResult.status === "already_claimed"
      ? "该设备已体验过免费额度，请使用充值码继续。"
      : grantResult.status === "missing_device"
        ? "未识别设备指纹，无法发放新手额度。"
        : grantResult.status === "rate_limited"
          ? "检测到同网络短时多次领取，新手额度暂不可发放，请稍后或使用充值码继续。"
        : undefined

  return c.json({
    credits: userRecord.credits,
    lifetimeUsed,
    trialStatus: grantResult.status,
    trialHint
  })
}
