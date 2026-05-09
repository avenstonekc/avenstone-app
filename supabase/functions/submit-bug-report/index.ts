import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const BUG_NOTIFY_EMAILS = Deno.env.get("BUG_NOTIFY_EMAILS") || "kalin@avenstonekc.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function formatBreadcrumbs(breadcrumbs: unknown[]): string {
  if (!breadcrumbs?.length) return "None";
  return breadcrumbs.map((b: any, i: number) =>
    `${i + 1}. [${b.ts?.slice(11, 19) || ""}] ${b.type} — ${b.label || b.route || ""}`
  ).join("\n");
}

function formatErrors(errors: unknown[]): string {
  if (!errors?.length) return "None";
  return errors.map((e: any) => `• ${e.ts?.slice(11, 19) || ""} ${e.message || ""}`).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ ok: false, error: "Unauthenticated" }, 401);

    const admin = createClient(SB_URL, SB_SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) return json({ ok: false, error: "Unauthenticated" }, 401);

    const body = await req.json();
    const {
      description,
      route,
      app_version,
      device_info,
      breadcrumbs = [],
      console_errors = [],
      network_errors = [],
      screenshot_dataurl,
      pending_task_id,
    } = body;

    if (!description) return json({ ok: false, error: "description required" }, 400);

    // Derive user profile
    const { data: profile } = await admin
      .from("profiles")
      .select("id, tenant_id, role, email")
      .eq("id", user.id)
      .single();
    if (!profile) return json({ ok: false, error: "Profile not found" }, 403);

    const { data: tenant } = await admin
      .from("tenants")
      .select("name")
      .eq("id", profile.tenant_id)
      .single();
    const tenantName = (tenant?.name as string) || "Unknown Tenant";

    // Generate bug ID pre-insert so we can reference it
    const bug_id = crypto.randomUUID();

    // Handle screenshot
    let screenshot_url: string | null = null;
    if (screenshot_dataurl) {
      try {
        const base64Data = screenshot_dataurl.replace(/^data:image\/\w+;base64,/, "");
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const path = `${profile.tenant_id}/${bug_id}.png`;
        const { error: uploadErr } = await admin.storage
          .from("bug-screenshots")
          .upload(path, bytes.buffer, { contentType: "image/png", upsert: false });
        if (!uploadErr) {
          const { data: signedData } = await admin.storage
            .from("bug-screenshots")
            .createSignedUrl(path, 31536000); // 1 year
          screenshot_url = signedData?.signedUrl || null;
        }
      } catch (_e) {
        console.error("Screenshot upload failed:", _e);
      }
    }

    // Insert bug_reports row
    const now = new Date().toISOString();
    const { error: insertErr } = await admin.from("bug_reports").insert({
      id: bug_id,
      tenant_id: profile.tenant_id,
      user_id: user.id,
      user_role: profile.role || "unknown",
      status: "open",
      description,
      route: route || null,
      app_version: app_version || null,
      device_info: device_info || null,
      breadcrumbs,
      console_errors,
      network_errors,
      screenshot_url,
      created_at: now,
      updated_at: now,
    });
    if (insertErr) return json({ ok: false, error: insertErr.message }, 500);

    // Build paste-ready Claude prompt
    const claudePrompt = `Bug report from ${profile.email || user.id} (${profile.role}) at tenant ${tenantName}.
Bug ID: ${bug_id}

User said:
"${description}"

Route at time of bug: ${route || "unknown"}
App version: ${app_version || "unknown"} | Device: ${device_info || "unknown"}
Submitted: ${now}

Last 20 user actions before bug:
${formatBreadcrumbs(breadcrumbs)}

Console errors (last 10):
${formatErrors(console_errors)}

Network errors (last 10):
${formatErrors(network_errors)}

Screenshot: ${screenshot_url || "none"}

---

Tasks:
1. AUDIT FIRST. Read the component(s) at the failing route and any edge fn called in the network errors above. Report what's there before any fix hypothesis. Cite specific file paths and line numbers.
2. State your hypothesis labeled "Hypothesis:" not "Confirmed:" — must be grounded in the breadcrumbs/errors above, not invented.
3. If the fix is one-line obvious (typo, missing await, off-by-one, wrong return shape), patch and explain. Otherwise wait for human greenlight on the hypothesis before patching.
4. One commit per logical change. Push to main per commit. Do not batch.
5. Append a [LOG — YYYY-MM-DD] entry to CLAUDE_MEMORY.md noting bug ID ${bug_id}, root cause, and fix.
6. After merge, update bug_reports row ${bug_id}: status='fixed', fixed_at=NOW().

Do not touch unrelated files. Stay in scope. Do not opportunistically refactor.`;

    // Build email HTML
    const metaRows = [
      ["From", `${profile.email || user.id} (${profile.role})`],
      ["Tenant", tenantName],
      ["Route", route || "—"],
      ["Submitted", new Date(now).toLocaleString("en-US")],
      ["App version", app_version || "—"],
      ["Device", device_info || "—"],
    ];
    const metaHtml = metaRows.map(([k, v]) =>
      `<tr><td style="padding:4px 8px;color:#6B7280;font-size:13px;white-space:nowrap;">${k}</td><td style="padding:4px 8px;color:#0A1F44;font-size:13px;">${v}</td></tr>`
    ).join("");

    const breadcrumbsHtml = Array.isArray(breadcrumbs) && breadcrumbs.length
      ? `<ol style="margin:0;padding-left:20px;">${breadcrumbs.map((b: any) =>
          `<li style="font-size:13px;color:#374151;margin-bottom:2px;">[${b.ts?.slice(11, 19) || ""}] <strong>${b.type}</strong> — ${b.label || b.route || ""}</li>`
        ).join("")}</ol>`
      : "<p style='color:#9CA3AF;font-size:13px;'>No breadcrumbs recorded</p>";

    const consoleErrorsHtml = Array.isArray(console_errors) && console_errors.length
      ? `<ul style="margin:0;padding-left:20px;">${console_errors.map((e: any) =>
          `<li style="font-size:12px;font-family:monospace;color:#991B1B;margin-bottom:4px;">${e.ts?.slice(11, 19) || ""} ${e.message || ""}</li>`
        ).join("")}</ul>`
      : "<p style='color:#9CA3AF;font-size:13px;'>None</p>";

    const networkErrorsHtml = Array.isArray(network_errors) && network_errors.length
      ? `<ul style="margin:0;padding-left:20px;">${network_errors.map((e: any) =>
          `<li style="font-size:12px;font-family:monospace;color:#991B1B;margin-bottom:4px;">${e.ts?.slice(11, 19) || ""} [${e.type}] ${e.message || ""}</li>`
        ).join("")}</ul>`
      : "<p style='color:#9CA3AF;font-size:13px;'>None</p>";

    const screenshotHtml = screenshot_url
      ? `<p style="font-size:13px;color:#374151;">Screenshot: <a href="${screenshot_url}" style="color:#0A1F44;">view</a></p>`
      : "";

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:32px 16px;">
<tr><td align="center"><table width="100%" style="max-width:620px;">
<tr><td style="background:#fff;border-radius:8px;padding:32px;border:1px solid #E8E4DC;">

<h2 style="margin:0 0 16px;font-size:20px;color:#0A1F44;">Bug submitted from ${tenantName}</h2>

<table style="border-collapse:collapse;width:100%;margin-bottom:20px;">${metaHtml}</table>

<h3 style="margin:0 0 8px;font-size:15px;color:#0A1F44;">Description</h3>
<p style="margin:0 0 20px;font-size:14px;color:#374151;background:#F7F5F0;padding:12px;border-radius:6px;">${description}</p>

<h3 style="margin:0 0 8px;font-size:15px;color:#0A1F44;">Last actions</h3>
<div style="margin-bottom:20px;">${breadcrumbsHtml}</div>

<h3 style="margin:0 0 8px;font-size:15px;color:#0A1F44;">Console errors</h3>
<div style="margin-bottom:20px;">${consoleErrorsHtml}</div>

<h3 style="margin:0 0 8px;font-size:15px;color:#0A1F44;">Network errors</h3>
<div style="margin-bottom:20px;">${networkErrorsHtml}</div>

${screenshotHtml}

<p style="font-size:13px;color:#374151;margin-bottom:20px;">
  <a href="https://avenstone-app.vercel.app/admin/bugs/${bug_id}" style="color:#0A1F44;font-weight:600;">View in app →</a>
</p>

<hr style="border:none;border-top:1px solid #E8E4DC;margin:20px 0;" />

<h3 style="margin:0 0 8px;font-size:15px;color:#0A1F44;">Paste this into Claude Code to audit + fix:</h3>
<pre style="background:#0A1F44;color:#F7F5F0;padding:16px;border-radius:8px;overflow-x:auto;font-family:monospace;font-size:13px;white-space:pre-wrap;">${claudePrompt.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>

</td></tr>
</table></td></tr>
</table>
</body></html>`;

    // Send email via Resend
    const toEmails = BUG_NOTIFY_EMAILS.split(",").map((e: string) => e.trim()).filter(Boolean);
    const subject = `[Bug] ${tenantName} · ${truncate(description, 60)}`;
    const FROM = `${tenantName} <notifications@avenstonekc.com>`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: toEmails, subject, html }),
    });

    if (emailRes.ok) {
      await admin
        .from("bug_reports")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", bug_id);
    }

    // Complete pending task if provided
    if (pending_task_id) {
      await admin
        .from("pending_tasks")
        .update({
          status: "complete",
          resulting_entity_type: "bug_report",
          resulting_entity_id: bug_id,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", pending_task_id);
    }

    return json({ ok: true, bug_id });
  } catch (err: unknown) {
    console.error("submit-bug-report error:", err);
    return json({ ok: false, error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
