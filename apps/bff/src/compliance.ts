import type { ComplianceProfile } from "@formpilot/shared"
import { supabase } from "./db"

function mapRow(row: {
  legal_name: string | null
  website: string | null
  business_category: string | null
  has_own_factory: boolean | null
  fulfillment_model: string | null
  return_policy_url: string | null
  support_email: string | null
  support_phone: string | null
  additional_evidence: string | null
  updated_at?: string | null
}): ComplianceProfile {
  return {
    legalName: row.legal_name || "",
    website: row.website || "",
    businessCategory: row.business_category || "",
    hasOwnFactory: Boolean(row.has_own_factory),
    fulfillmentModel: row.fulfillment_model || "",
    returnPolicyUrl: row.return_policy_url || "",
    supportEmail: row.support_email || "",
    supportPhone: row.support_phone || "",
    additionalEvidence: row.additional_evidence || "",
    updatedAt: row.updated_at || undefined
  }
}

export async function getComplianceProfile(userId: string): Promise<ComplianceProfile | null> {
  const { data, error } = await supabase
    .from("compliance_profiles")
    .select(
      "legal_name,website,business_category,has_own_factory,fulfillment_model,return_policy_url,support_email,support_phone,additional_evidence,updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return mapRow(data)
}

export async function upsertComplianceProfile(userId: string, profile: ComplianceProfile): Promise<ComplianceProfile> {
  const payload = {
    user_id: userId,
    legal_name: profile.legalName.trim(),
    website: profile.website.trim(),
    business_category: profile.businessCategory.trim(),
    has_own_factory: Boolean(profile.hasOwnFactory),
    fulfillment_model: profile.fulfillmentModel.trim(),
    return_policy_url: profile.returnPolicyUrl.trim(),
    support_email: profile.supportEmail.trim(),
    support_phone: profile.supportPhone.trim(),
    additional_evidence: (profile.additionalEvidence || "").trim() || null,
    updated_at: new Date().toISOString()
  }

  const { data, error } = await supabase
    .from("compliance_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select(
      "legal_name,website,business_category,has_own_factory,fulfillment_model,return_policy_url,support_email,support_phone,additional_evidence,updated_at"
    )
    .single()

  if (error || !data) throw error
  return mapRow(data)
}
