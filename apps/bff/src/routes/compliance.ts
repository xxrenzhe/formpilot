import type { Context } from "hono"
import { z } from "zod"
import type { ComplianceProfile } from "@formpilot/shared"
import { getAuthUser } from "../auth"
import { jsonError } from "../response"
import { getOrCreateUserRecord } from "../user"
import { getComplianceProfile, upsertComplianceProfile } from "../compliance"

const profileSchema = z.object({
  legalName: z.string().max(200),
  website: z.string().max(400),
  businessCategory: z.string().max(200),
  hasOwnFactory: z.boolean(),
  fulfillmentModel: z.string().max(300),
  returnPolicyUrl: z.string().max(500),
  supportEmail: z.string().max(200),
  supportPhone: z.string().max(80),
  additionalEvidence: z.string().max(3000).optional()
})

function emptyProfile(): ComplianceProfile {
  return {
    legalName: "",
    website: "",
    businessCategory: "",
    hasOwnFactory: false,
    fulfillmentModel: "",
    returnPolicyUrl: "",
    supportEmail: "",
    supportPhone: "",
    additionalEvidence: ""
  }
}

export async function getComplianceProfileHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, { errorCode: "UNAUTHORIZED", message: "未登录" })
  }

  await getOrCreateUserRecord(authUser.id, authUser.email)
  const profile = (await getComplianceProfile(authUser.id)) || emptyProfile()
  return c.json({ profile })
}

export async function upsertComplianceProfileHandler(c: Context): Promise<Response> {
  const authUser = await getAuthUser(c)
  if (!authUser) {
    return jsonError(c, 401, { errorCode: "UNAUTHORIZED", message: "未登录" })
  }

  await getOrCreateUserRecord(authUser.id, authUser.email)
  const payload = profileSchema.safeParse(await c.req.json())
  if (!payload.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const profile = await upsertComplianceProfile(authUser.id, payload.data)
  return c.json({ profile })
}
