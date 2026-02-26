import { supabase } from "./db"

export type AdminAuditAction = "plan_update" | "invite_generate" | "invite_redeem"

export async function recordAdminAudit(params: {
  adminId: string | null
  actionType: AdminAuditAction
  targetId?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  const { error } = await supabase.from("admin_audit_logs").insert({
    admin_id: params.adminId,
    action_type: params.actionType,
    target_id: params.targetId || null,
    metadata: params.metadata || {}
  })
  if (error) throw error
}
