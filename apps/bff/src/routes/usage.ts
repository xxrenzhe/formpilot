import type { Context } from "hono"
import { getAuthUser } from "../auth"
import { getOrCreateUserRecord } from "../user"
import { FREE_MONTHLY_LIMIT, getMonthlyUsageCount, getUsageMonthKey } from "../usage"
import { jsonError } from "../response"

export async function usageHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, {
      errorCode: "UNAUTHORIZED",
      message: "未登录"
    })
  }

  const userRecord = await getOrCreateUserRecord(authUser.id, authUser.email)
  const now = new Date()
  const used = await getMonthlyUsageCount(userRecord.id, now)
  const limit = userRecord.plan === "pro" ? -1 : FREE_MONTHLY_LIMIT

  return c.json({
    month: getUsageMonthKey(now),
    used,
    limit,
    plan: userRecord.plan
  })
}
