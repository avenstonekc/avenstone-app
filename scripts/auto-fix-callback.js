#!/usr/bin/env node
// CLI: node scripts/auto-fix-callback.js --bug-id <uuid> --status <auto_fixed|auto_fix_failed> [--commit <sha>] [--notes <text>]
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env in repo root (or from environment).
// Exit 0 = DB row updated. Exit 1 = any error.

"use strict";

const { readFileSync } = require("fs");
const { resolve } = require("path");

function loadEnv() {
  const envPath = resolve(__dirname, "../.env");
  try {
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env absent — rely on process.env already set
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
  };
  return {
    bugId:  get("--bug-id"),
    status: get("--status"),
    commit: get("--commit"),
    notes:  get("--notes"),
  };
}

loadEnv();

const { bugId, status, commit, notes } = parseArgs();

const VALID_STATUSES = ["auto_fixed", "auto_fix_failed"];

if (!bugId || !status) {
  console.error("Usage: node scripts/auto-fix-callback.js --bug-id <uuid> --status <auto_fixed|auto_fix_failed> [--commit <sha>] [--notes <text>]");
  process.exit(1);
}

if (!VALID_STATUSES.includes(status)) {
  console.error(`Invalid --status: "${status}". Must be one of: ${VALID_STATUSES.join(", ")}`);
  process.exit(1);
}

const SB_URL     = process.env.SUPABASE_URL;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_SERVICE) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment or .env");
  process.exit(1);
}

const patch = { status, updated_at: new Date().toISOString() };
if (commit) patch.auto_fix_commit = commit;
if (notes)  patch.auto_fix_notes  = notes;

const url = `${SB_URL}/rest/v1/bug_reports?id=eq.${encodeURIComponent(bugId)}`;

(async () => {
  let res;
  try {
    res = await fetch(url, {
      method: "PATCH",
      headers: {
        "apikey":        SB_SERVICE,
        "Authorization": `Bearer ${SB_SERVICE}`,
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
      },
      body: JSON.stringify(patch),
    });
  } catch (err) {
    console.error("Network error:", err.message);
    process.exit(1);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`Supabase PATCH failed ${res.status}: ${body}`);
    process.exit(1);
  }

  console.log(`bug_reports ${bugId} → status='${status}'${commit ? `, commit=${commit}` : ""}${notes ? `, notes=${notes}` : ""}`);
  process.exit(0);
})();
