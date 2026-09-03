// weekly-hours-report — Friday projected-hours email for the owner.
// Cron-triggered (Fridays, ~afternoon Chicago). ZERO AI: pure SQL + Resend. ~1 email/week.
//
// Logic mirrors src/lib/earnings.js (STRAIGHT TIME ONLY, no OT). It cannot import from src/lib
// (edge-function boundary), so the small pure helpers are inlined here. Any change to the
// projection/rate rules should be reflected in earnings.js and vice-versa.
//
// Projection: crew "always get off at 5 on Fridays" — anyone still clocked in is projected out to
// THIS week's Friday 17:00 America/Chicago. Pay is shown ONLY where an hourly rate is on file;
// no rate → hours only (never $0-priced).

import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = "Avenstone Group <notifications@avenstonekc.com>";
const TENANT_ID = "00000000-0000-0000-0000-000000000001"; // Avenstone
const REPORT_EMAILS = (Deno.env.get("REPORT_EMAILS") || "kalin@avenstonekc.com")
  .split(",").map((s) => s.trim()).filter(Boolean);
const QUIT_HOUR = 17; // 5:00 PM Chicago
const TZ = "America/Chicago";

// ── tz helpers ────────────────────────────────────────────────────────────────
const _dtf = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
// ISO instant → 'YYYY-MM-DD' Chicago calendar date
const chicagoDate = (iso: string | Date) => _dtf.format(new Date(iso));

// Sunday (YYYY-MM-DD) of the week containing a YYYY-MM-DD date. All-UTC so the server tz can't shift it.
function weekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  return dt.toISOString().slice(0, 10);
}

// Chicago's UTC offset (ms) at a given instant — handles DST.
function tzOffsetMs(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
  return asUTC - date.getTime();
}

// UTC instant for a Chicago wall-clock time (dateStr @ hour:00 local).
function chicagoWallToUtc(dateStr: string, hour: number): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, hour, 0, 0);        // treat wall time as if UTC
  const off = tzOffsetMs(new Date(naive));                 // Chicago offset at that instant
  return new Date(naive - off);
}

// Add n days to a YYYY-MM-DD (UTC math), return YYYY-MM-DD.
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// effective hourly rate for a date = greatest effective_date <= dateStr; null if none.
function effectiveRate(rateRows: any[], dateStr: string): number | null {
  let best: any = null;
  for (const r of rateRows || []) {
    if (r.effective_date <= dateStr && (!best || r.effective_date > best.effective_date)) best = r;
  }
  return best ? Number(best.rate) : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const hoursBetween = (a: string | Date, b: string | Date) => (new Date(b).getTime() - new Date(a).getTime()) / 3600000;
const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

Deno.serve(async (_req) => {
  try {
    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

    const now = new Date();
    const todayStr = chicagoDate(now);               // Chicago 'today' (the Friday when cron fires)
    const curWeek = weekStart(todayStr);             // Sunday of this week
    const fridayStr = addDays(curWeek, 5);           // this week's Friday
    const quitInstant = chicagoWallToUtc(fridayStr, QUIT_HOUR); // Friday 17:00 Chicago, as UTC
    // Project open segments to 5pm — unless the report runs after 5pm, then use real 'now'.
    const projEnd = now.getTime() > quitInstant.getTime() ? now : quitInstant;

    // Active crew on the tenant
    const { data: crew } = await sb
      .from("profiles")
      .select("id, full_name, email")
      .eq("tenant_id", TENANT_ID).eq("role", "crew").eq("is_active", true);

    if (!crew || crew.length === 0) {
      return new Response(JSON.stringify({ ok: true, note: "no active crew" }), { status: 200 });
    }
    const crewIds = crew.map((c) => c.id);

    // This week's entries (fetch a generous window, filter to the week in JS)
    const sinceIso = new Date(now.getTime() - 8 * 86400000).toISOString();
    const { data: entries } = await sb
      .from("time_entries")
      .select("user_id, clock_in, clock_out")
      .eq("tenant_id", TENANT_ID).in("user_id", crewIds).gte("clock_in", sinceIso);

    // Pay rates for these crew
    const { data: rates } = await sb
      .from("employee_pay_rates")
      .select("user_id, rate, effective_date")
      .eq("tenant_id", TENANT_ID).in("user_id", crewIds);
    const ratesByUser: Record<string, any[]> = {};
    for (const r of rates || []) (ratesByUser[r.user_id] ||= []).push(r);

    // Per-crew projected hours
    const perUser: Record<string, { hours: number; open: boolean }> = {};
    for (const id of crewIds) perUser[id] = { hours: 0, open: false };
    for (const e of entries || []) {
      const inDate = chicagoDate(e.clock_in);
      if (weekStart(inDate) !== curWeek) continue;              // only this Sun–Sat week
      const end = e.clock_out ? e.clock_out : projEnd;          // project open segments to 5pm Fri
      const h = Math.max(0, hoursBetween(e.clock_in, end));
      perUser[e.user_id].hours += h;
      if (!e.clock_out) perUser[e.user_id].open = true;
    }

    // Build rows
    let anyHours = false, grandHours = 0, grandPay = 0, anyPay = false;
    const rows = crew
      .map((c) => {
        const hours = round1(perUser[c.id].hours);
        const rate = effectiveRate(ratesByUser[c.id] || [], fridayStr);
        const pay = rate != null ? round2(perUser[c.id].hours * rate) : null;
        if (hours > 0) anyHours = true;
        grandHours += perUser[c.id].hours;
        if (pay != null) { grandPay += pay; anyPay = true; }
        return { name: c.full_name || c.email, hours, rate, pay, open: perUser[c.id].open };
      })
      .sort((a, b) => b.hours - a.hours);

    const fmtDate = (s: string) => {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric" });
    };

    const bodyRows = rows.map((r) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #EEE;font-size:14px;color:#0A1F44;">${r.name}${r.open ? ' <span style="color:#C9A84C;font-size:11px;">• on the clock</span>' : ""}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #EEE;font-size:14px;color:#0A1F44;text-align:right;font-variant-numeric:tabular-nums;">${r.hours.toFixed(1)} h</td>
        <td style="padding:10px 12px;border-bottom:1px solid #EEE;font-size:14px;text-align:right;font-variant-numeric:tabular-nums;color:${r.pay != null ? "#0A1F44" : "#9CA3AF"};">${r.pay != null ? money(r.pay) : "— no rate"}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 16px;"><tr><td align="center">
    <table width="100%" style="max-width:560px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <div style="font-size:11px;color:#C9A84C;letter-spacing:4px;text-transform:uppercase;margin-bottom:4px;">Avenstone Group</div>
        <div style="width:32px;height:2px;background:#C9A84C;margin:0 auto;"></div>
      </td></tr>
      <tr><td style="background:#fff;border-radius:8px;padding:28px;border:1px solid #E8E4DC;">
        <h2 style="margin:0 0 4px;font-size:18px;color:#0A1F44;font-weight:600;">Projected hours — week of ${fmtDate(curWeek)}</h2>
        <p style="margin:0 0 20px;font-size:13px;color:#6B7280;">Projected to Friday 5:00 PM quit time.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="padding:8px 12px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#9CA3AF;border-bottom:2px solid #E8E4DC;">Crew</td>
            <td style="padding:8px 12px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#9CA3AF;border-bottom:2px solid #E8E4DC;text-align:right;">Hours</td>
            <td style="padding:8px 12px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#9CA3AF;border-bottom:2px solid #E8E4DC;text-align:right;">Projected pay</td>
          </tr>
          ${bodyRows}
          <tr>
            <td style="padding:12px;font-size:14px;font-weight:600;color:#0A1F44;">Total</td>
            <td style="padding:12px;font-size:14px;font-weight:600;color:#0A1F44;text-align:right;font-variant-numeric:tabular-nums;">${round1(grandHours).toFixed(1)} h</td>
            <td style="padding:12px;font-size:14px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums;color:${anyPay ? "#0A1F44" : "#9CA3AF"};">${anyPay ? money(round2(grandPay)) : "—"}</td>
          </tr>
        </table>
        ${anyPay ? '<p style="margin:18px 0 0;font-size:12px;color:#9CA3AF;line-height:1.6;">Straight time, before taxes — overtime premium not included. Pay shown only where an hourly rate is on file.</p>' : '<p style="margin:18px 0 0;font-size:12px;color:#9CA3AF;line-height:1.6;">No hourly rates on file yet — showing hours only. Add a pay rate on a crew member (Team → their profile) to see projected pay here.</p>'}
      </td></tr>
      <tr><td style="padding-top:20px;text-align:center;font-size:11px;color:#9CA3AF;line-height:1.8;">Avenstone Group · Kansas City, MO</td></tr>
    </table>
  </td></tr></table>
</body></html>`;

    const subject = `Projected hours — week of ${fmtDate(curWeek)} (${round1(grandHours).toFixed(1)} h)`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: REPORT_EMAILS, subject, html }),
    });
    const data = await res.json();
    return new Response(JSON.stringify({ ok: res.ok, sent_to: REPORT_EMAILS, crew: rows.length, totalHours: round1(grandHours), resend: data }), {
      status: res.ok ? 200 : 502, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("weekly-hours-report error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
