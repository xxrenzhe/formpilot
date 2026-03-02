import type { AppScenario, ComplianceProfile, FieldContext, GenerateMode, PageContext } from "./types"

interface BuildPromptInput {
  scenario: AppScenario
  pageContext: PageContext
  fieldContext: FieldContext
  complianceProfile?: ComplianceProfile
  templateBody?: string
  mode: GenerateMode
  userHint: string
  globalContext?: string
}

export function buildSystemPrompt(input: BuildPromptInput): string {
  const { scenario, pageContext, fieldContext, complianceProfile, templateBody, mode, userHint, globalContext } = input
  const scenarioPrompt = scenario === "ads_compliance" ? buildAdsScenarioPrompt(complianceProfile, templateBody) : buildGeneralScenarioPrompt()

  return `${scenarioPrompt}
<response_contract>
1. Always output BOTH [TRANSLATION]...[/TRANSLATION] and [REPLY]...[/REPLY].
2. [TRANSLATION] must be concise Simplified Chinese explanation for the business owner.
3. [REPLY] must be in the page language (${pageContext.lang || "en"}) and ready to paste.
4. No markdown code block.
5. If facts are missing, state assumptions explicitly and keep claims factual.
</response_contract>

<context>
mode: ${mode}
page_title: ${pageContext.title}
page_description: ${pageContext.description}
page_url: ${pageContext.url || ""}
field_label: ${fieldContext.label}
field_placeholder: ${fieldContext.placeholder}
field_type: ${fieldContext.type}
field_surrounding: ${fieldContext.surroundingText || ""}
</context>

${globalContext ? `<global_context>\n${globalContext}\n</global_context>` : ""}

<user_hint>${userHint || "none"}</user_hint>`
}

function buildGeneralScenarioPrompt(): string {
  return `You are FormPilot, a compliance-first writing copilot.
Focus on factual, concise, and field-specific answers.
Avoid invented data and unverifiable promises.`
}

function buildAdsScenarioPrompt(profile?: ComplianceProfile, templateBody?: string): string {
  const template = templateBody?.trim() || DEFAULT_ADS_TEMPLATE
  return `${template}

<compliance_facts>
legal_name: ${profile?.legalName || "MISSING"}
website: ${profile?.website || "MISSING"}
business_category: ${profile?.businessCategory || "MISSING"}
has_own_factory: ${typeof profile?.hasOwnFactory === "boolean" ? String(profile.hasOwnFactory) : "MISSING"}
fulfillment_model: ${profile?.fulfillmentModel || "MISSING"}
return_policy_url: ${profile?.returnPolicyUrl || "MISSING"}
support_email: ${profile?.supportEmail || "MISSING"}
support_phone: ${profile?.supportPhone || "MISSING"}
additional_evidence: ${profile?.additionalEvidence || "none"}
</compliance_facts>`
}

const DEFAULT_ADS_TEMPLATE = `You are a Google Ads compliance appeal specialist.
Goal: maximize approval probability using factual, policy-aware language.

Output style in [REPLY]:
- Use clear bullet points.
- Explain business verification signals and compliance controls.
- Keep tone professional and auditable.
- If asked for long-form appeal, provide structure: Overview, Business Model, Risk Controls, Commitment.
- Never fabricate licenses, certificates, or legal statements.`

export function buildUserPrompt(mode: GenerateMode): string {
  if (mode === "longDoc") {
    return "Draft a complete, structured appeal letter with sections and actionable policy alignment."
  }
  return "Draft a concise and compliant answer for this specific field."
}

export function findComplianceMissingFields(profile?: ComplianceProfile): string[] {
  if (!profile) {
    return [
      "legalName",
      "website",
      "businessCategory",
      "fulfillmentModel",
      "returnPolicyUrl",
      "supportEmail",
      "supportPhone"
    ]
  }

  const checks: Array<[string, string | boolean | undefined]> = [
    ["legalName", profile.legalName],
    ["website", profile.website],
    ["businessCategory", profile.businessCategory],
    ["fulfillmentModel", profile.fulfillmentModel],
    ["returnPolicyUrl", profile.returnPolicyUrl],
    ["supportEmail", profile.supportEmail],
    ["supportPhone", profile.supportPhone]
  ]

  return checks
    .filter(([, value]) => typeof value !== "boolean" && !String(value || "").trim())
    .map(([key]) => key)
}

export function isLikelyAdsScenario(input: { url?: string; title?: string; description?: string }): boolean {
  const combined = `${input.url || ""} ${input.title || ""} ${input.description || ""}`.toLowerCase()
  return (
    combined.includes("ads.google") ||
    combined.includes("google ads") ||
    combined.includes("business operations") ||
    combined.includes("appeal") ||
    combined.includes("token application")
  )
}
