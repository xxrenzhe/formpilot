export type GenerateMode = "shortText" | "longDoc"
export type AppScenario = "general" | "ads_compliance"
export type CreditCostTier = "short_text" | "long_doc" | "evidence_heavy"

export interface PageContext {
  title: string
  description: string
  lang: string
  url?: string
}

export interface FieldContext {
  label: string
  placeholder: string
  type: string
  surroundingText?: string
}

export interface ComplianceProfile {
  legalName: string
  website: string
  businessCategory: string
  hasOwnFactory: boolean
  fulfillmentModel: string
  returnPolicyUrl: string
  supportEmail: string
  supportPhone: string
  additionalEvidence?: string
  updatedAt?: string
}

export interface PromptTemplate {
  id: string
  scenario: AppScenario
  name: string
  templateBody: string
  weight: number
  active: boolean
  updatedAt: string
}

export interface GenerateRequest {
  pageContext: PageContext
  fieldContext: FieldContext
  scenario?: AppScenario
  complianceSnapshot?: ComplianceProfile
  userHint?: string
  mode: GenerateMode
  useGlobalContext?: boolean
  globalContext?: string
}

export interface GenerateErrorResponse {
  errorCode:
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "USAGE_LIMIT"
    | "MISSING_CONFIG"
    | "INVALID_CODE"
    | "INSUFFICIENT_CREDITS"
    | "MISSING_COMPLIANCE_PROFILE"
  message: string
  upgradeUrl?: string
  requiredCredits?: number
  currentCredits?: number
}

export interface UsageSummary {
  credits: number
  lifetimeUsed: number
  trialStatus?: "granted" | "already_claimed" | "missing_device"
  trialHint?: string
}

export const METRIC_EVENT_TYPES = [
  "panel_open",
  "generate_success",
  "copy_success",
  "paywall_shown",
  "rewrite_click",
  "pii_override",
  "longdoc_open",
  "longdoc_generate_success",
  "longdoc_copy_success",
  "longdoc_download",
  "appeal_feedback_success",
  "appeal_feedback_fail"
] as const

export type MetricEventType = (typeof METRIC_EVENT_TYPES)[number]

export interface MetricEventPayload {
  eventType: MetricEventType
  metadata?: Record<string, string | number | boolean>
}
