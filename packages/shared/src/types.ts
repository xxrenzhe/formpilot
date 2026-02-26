export type UserPlan = "free" | "pro" | "unknown"

export type GenerateMode = "shortText" | "longDoc"

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

export interface UserPersona {
  id: string
  name: string
  isDefault: boolean
  coreIdentity: string
  companyInfo: string
  tonePreference: string
  customRules?: string
}

export interface GenerateRequest {
  pageContext: PageContext
  fieldContext: FieldContext
  personaId?: string
  personaSnapshot?: UserPersona
  userHint?: string
  mode: GenerateMode
  useGlobalContext?: boolean
  globalContext?: string
}

export interface GenerateErrorResponse {
  errorCode: "UNAUTHORIZED" | "FORBIDDEN" | "USAGE_LIMIT" | "MISSING_CONFIG"
  message: string
  upgradeUrl?: string
}

export interface UsageSummary {
  month: string
  used: number
  limit: number
  plan: UserPlan
}
