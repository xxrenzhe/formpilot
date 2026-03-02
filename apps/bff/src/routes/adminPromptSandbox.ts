import type { Context } from "hono"
import { z } from "zod"
import { buildSystemPrompt, buildUserPrompt } from "@formpilot/shared"
import { requireAdmin } from "../admin"
import { jsonError } from "../response"
import { streamGenerate } from "../ai"

const sandboxSchema = z.object({
  scenario: z.enum(["general", "ads_compliance"]),
  templateBody: z.string().min(1).max(12000),
  userHint: z.string().max(3000).optional(),
  sampleGlobalContext: z.string().max(12000).optional(),
  complianceSnapshot: z
    .object({
      legalName: z.string().optional(),
      website: z.string().optional(),
      businessCategory: z.string().optional(),
      hasOwnFactory: z.boolean().optional(),
      fulfillmentModel: z.string().optional(),
      returnPolicyUrl: z.string().optional(),
      supportEmail: z.string().optional(),
      supportPhone: z.string().optional(),
      additionalEvidence: z.string().optional()
    })
    .optional()
})

export async function promptSandboxHandler(c: Context): Promise<Response> {
  const admin = await requireAdmin(c)
  if (admin instanceof Response) return admin

  const payload = sandboxSchema.safeParse(await c.req.json())
  if (!payload.success) {
    return jsonError(c, 400, { errorCode: "FORBIDDEN", message: "参数错误" })
  }

  const data = payload.data
  const systemPrompt = buildSystemPrompt({
    scenario: data.scenario,
    pageContext: {
      title: "Google Ads Appeal Sandbox",
      description: "Admin prompt sandbox preview",
      lang: "en",
      url: "https://ads.google.com/sandbox"
    },
    fieldContext: {
      label: "Appeal Body",
      placeholder: "Write the complete appeal answer",
      type: "textarea",
      surroundingText: "Admin sandbox environment"
    },
    complianceProfile: data.complianceSnapshot
      ? {
          legalName: data.complianceSnapshot.legalName || "",
          website: data.complianceSnapshot.website || "",
          businessCategory: data.complianceSnapshot.businessCategory || "",
          hasOwnFactory: Boolean(data.complianceSnapshot.hasOwnFactory),
          fulfillmentModel: data.complianceSnapshot.fulfillmentModel || "",
          returnPolicyUrl: data.complianceSnapshot.returnPolicyUrl || "",
          supportEmail: data.complianceSnapshot.supportEmail || "",
          supportPhone: data.complianceSnapshot.supportPhone || "",
          additionalEvidence: data.complianceSnapshot.additionalEvidence || ""
        }
      : undefined,
    templateBody: data.templateBody,
    mode: "longDoc",
    userHint: data.userHint || "",
    globalContext: data.sampleGlobalContext || ""
  })

  const userPrompt = buildUserPrompt("longDoc")
  let output = ""

  await streamGenerate({
    systemPrompt,
    userPrompt,
    onToken: async (token) => {
      output += token
    }
  })

  return c.json({ output })
}
