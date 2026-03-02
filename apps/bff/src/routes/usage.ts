import type { Context } from "hono"
import { getAuthUser } from "../auth"
import { jsonError } from "../response"
import { ensureDeviceCreditGrant, getOrCreateUserRecord } from "../user"
import { getLifetimeCreditsUsed } from "../usage"

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
        : undefined

  return c.json({
    credits: userRecord.credits,
    lifetimeUsed,
    trialStatus: grantResult.status,
    trialHint
  })
}
