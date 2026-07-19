// AVEN_MERGE_ARC B6.1 Slice 1 — shared staff-notification helper (was duplicated as
// notifyTenantStaff in ai-master-agent and notify in ai-field-agent, identical logic).
// Mirrors sbNotify in src/lib/supabase.js. Fans a notification out to every owner / PM / sales_rep
// in the tenant except the actor. Fire-and-forget; failures are logged, never thrown.

// deno-lint-ignore no-explicit-any
export async function notifyTenantStaff(sb: any, tenantId: string, excludeId: string, payload: {
  type: string; title: string; body: string; jobId?: string;
}) {
  try {
    const { data } = await sb.from("profiles").select("id")
      .eq("tenant_id", tenantId).in("role", ["owner", "project_manager", "sales_rep"]);
    const targets = (data || []).map((p: any) => p.id).filter((id: string) => id !== excludeId);
    if (!targets.length) return;
    await sb.from("notifications").insert(
      targets.map((uid: string) => ({
        tenant_id: tenantId, user_id: uid, job_id: payload.jobId ?? null,
        type: payload.type, title: payload.title, body: payload.body,
        read: false, email_sent: false, sms_sent: false,
      })),
    );
  } catch (e) { console.error("[agentNotify]", e); }
}
