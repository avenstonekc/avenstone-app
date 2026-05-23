#!/usr/bin/env node
// AUTO_FIX_ARC Phase D callback — called by the VM executor after a fix commit.
//
// Success path (Vercel polling):
//   node scripts/auto-fix-callback.js --bug-id <uuid> --commit <sha> [--notes <text>]
//   Patches bug_reports.status='auto_fixed', then polls Vercel for the build verdict.
//   READY  → confirms auto_fixed, records vercel_deployment_id, exit 0.
//   ERROR  → git revert <sha>, git push, patches auto_fix_failed, exit 1.
//   TIMEOUT → patches auto_fix_unknown (no revert — human decides), exit 0.
//
// Explicit failure path (no Vercel polling):
//   node scripts/auto-fix-callback.js --bug-id <uuid> --status auto_fix_failed [--notes <text>]
//   Patches bug_reports.status directly, exit 1.

"use strict";

const { readFileSync } = require("fs");
const { resolve }      = require("path");
const { execSync }     = require("child_process");

const VERCEL_PROJECT_ID = "prj_unYQFeqt33L7y0eib1aCvxr252we";
const POLL_INTERVAL_MS  = 10_000;       // 10 s between polls
const POLL_MAX_MS       = 5 * 60_000;  // 5 min total
const REPO_PATH         = resolve(__dirname, "..");

function loadEnv() {
  const envPath = resolve(REPO_PATH, ".env");
  try {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch { /* .env absent — rely on process.env */ }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get  = (f) => { const i = args.indexOf(f); return i !== -1 && i + 1 < args.length ? args[i + 1] : null; };
  return { bugId: get("--bug-id"), status: get("--status"), commit: get("--commit"), notes: get("--notes") };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function patchBug(sbUrl, sbKey, bugId, fields) {
  const res = await fetch(`${sbUrl}/rest/v1/bug_reports?id=eq.${encodeURIComponent(bugId)}`, {
    method: "PATCH",
    headers: {
      "apikey":        sbKey,
      "Authorization": `Bearer ${sbKey}`,
      "Content-Type":  "application/json",
      "Prefer":        "return=minimal",
    },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase PATCH ${res.status}: ${body}`);
  }
}

// Returns { state: 'READY'|'ERROR'|'CANCELED'|'TIMEOUT', uid: string|null }
async function pollVercel(commitSha, vercelToken) {
  const url      = `https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&limit=10`;
  const deadline = Date.now() + POLL_MAX_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let data;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${vercelToken}` } });
      if (!res.ok) { console.warn(`Vercel API ${res.status} — retrying`); continue; }
      data = await res.json();
    } catch (err) {
      console.warn(`Vercel poll error: ${err.message} — retrying`);
      continue;
    }

    const dep = (data.deployments || []).find(d => d.meta?.githubCommitSha === commitSha);
    if (!dep) { console.log(`Vercel: no deployment for ${commitSha.slice(0, 8)} yet`); continue; }

    console.log(`Vercel: ${dep.uid} → ${dep.state}`);
    if (dep.state === "READY")                             return { state: "READY",    uid: dep.uid };
    if (dep.state === "ERROR" || dep.state === "CANCELED") return { state: dep.state, uid: dep.uid };
    // QUEUED / BUILDING — keep polling
  }

  return { state: "TIMEOUT", uid: null };
}

// ─── main ────────────────────────────────────────────────────────────────────

loadEnv();

const { bugId, status: explicitStatus, commit, notes } = parseArgs();

const SB_URL     = process.env.SUPABASE_URL;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VT         = process.env.VERCEL_API_TOKEN;

if (!bugId) {
  console.error("Usage: node scripts/auto-fix-callback.js --bug-id <uuid> --commit <sha> [--notes <text>]");
  console.error("       node scripts/auto-fix-callback.js --bug-id <uuid> --status auto_fix_failed [--notes <text>]");
  process.exit(1);
}

if (!commit && !explicitStatus) {
  console.error("Provide --commit <sha> (Vercel-verified success) or --status auto_fix_failed (explicit failure)");
  process.exit(1);
}

if (!SB_URL || !SB_SERVICE) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Explicit failure path — no Vercel polling
if (explicitStatus === "auto_fix_failed") {
  (async () => {
    try {
      await patchBug(SB_URL, SB_SERVICE, bugId, {
        status:          "auto_fix_failed",
        auto_fix_commit: commit || null,
        auto_fix_notes:  notes  || null,
      });
      console.log(`bug_reports ${bugId} → auto_fix_failed`);
      process.exit(1);
    } catch (err) {
      console.error("PATCH error:", err.message);
      process.exit(1);
    }
  })();
  return;
}

// Success + Vercel-polling path
(async () => {
  // 1. Mark auto_fixed optimistically
  try {
    await patchBug(SB_URL, SB_SERVICE, bugId, {
      status:          "auto_fixed",
      auto_fix_commit: commit,
      auto_fix_notes:  notes || null,
    });
    console.log(`bug_reports ${bugId} → auto_fixed (commit ${commit.slice(0, 8)})`);
  } catch (err) {
    console.error("Initial PATCH error:", err.message);
    process.exit(1);
  }

  // 2. Skip Vercel polling if no token configured
  if (!VT) {
    console.warn("VERCEL_API_TOKEN not set — skipping build verification. Status remains auto_fixed.");
    process.exit(0);
  }

  // 3. Poll Vercel for build verdict
  console.log(`Polling Vercel for commit ${commit.slice(0, 8)} (up to 5 min)...`);
  const verdict = await pollVercel(commit, VT);

  if (verdict.state === "READY") {
    // Build passed — record deployment ID and confirm
    try {
      await patchBug(SB_URL, SB_SERVICE, bugId, {
        status:               "auto_fixed",
        vercel_deployment_id: verdict.uid,
        auto_fix_notes:       notes ? `${notes} · build READY` : "Build READY",
      });
      console.log(`Build READY (${verdict.uid}) — auto_fixed confirmed.`);
      process.exit(0);
    } catch (err) {
      console.error("PATCH error on READY:", err.message);
      process.exit(1);
    }
  }

  if (verdict.state === "TIMEOUT") {
    // Don't revert on timeout — human checks manually
    try {
      await patchBug(SB_URL, SB_SERVICE, bugId, {
        status:               "auto_fix_unknown",
        vercel_deployment_id: null,
        auto_fix_notes:       `Build status timed out after 5 min. Commit ${commit.slice(0, 8)} may or may not be live. Manual check required.`,
      });
      console.warn("Build polling timed out — status → auto_fix_unknown. Commit NOT reverted.");
      process.exit(0);
    } catch (err) {
      console.error("PATCH error on TIMEOUT:", err.message);
      process.exit(1);
    }
  }

  // Build ERROR or CANCELED — revert and escalate
  console.error(`Build ${verdict.state} (${verdict.uid || "no-id"}) — reverting commit ${commit.slice(0, 8)}`);
  try {
    execSync(`git revert ${commit} --no-edit`, { cwd: REPO_PATH, stdio: "inherit" });
    execSync("git push origin main",            { cwd: REPO_PATH, stdio: "inherit" });
    console.log(`Reverted and pushed.`);
  } catch (revertErr) {
    console.error(`git revert/push failed: ${revertErr.message}`);
    // Still patch the DB even if revert failed
  }

  try {
    await patchBug(SB_URL, SB_SERVICE, bugId, {
      status:               "auto_fix_failed",
      vercel_deployment_id: verdict.uid || null,
      auto_fix_notes:       `Vercel build ${verdict.state}. Commit ${commit.slice(0, 8)} reverted. ${notes || ""}`.trim(),
    });
    console.error(`Status → auto_fix_failed.`);
    process.exit(1);
  } catch (err) {
    console.error("PATCH error after revert:", err.message);
    process.exit(1);
  }
})();
