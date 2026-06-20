#!/usr/bin/env node
// One-shot seat-testing account provisioner.
// Creates pm+test, rep+test, sub+test, client+test accounts on the Avenstone tenant.
// Run: node tools/provision_seat_accounts.js
// Safe to re-run: uses upsert/update semantics for idempotency.

const fs = require('fs');
const https = require('https');

const PAT_PATH = 'C:/Users/Kalin/supabase-token.txt';
const PROJECT_REF = 'cbfftukmhqvvjlrlnltk';
const SUPABASE_URL = 'https://cbfftukmhqvvjlrlnltk.supabase.co';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const PASSWORD = 'Avenstone';

const ACCOUNTS = [
  { email: 'pm+test@avenstonekc.com',     role: 'project_manager', name: 'Test PM' },
  { email: 'rep+test@avenstonekc.com',    role: 'sales_rep',       name: 'Test Rep' },
  { email: 'sub+test@avenstonekc.com',    role: 'sub',             name: 'Test Sub' },
  { email: 'client+test@avenstonekc.com', role: 'client',          name: 'Test Client' },
];

function request(opts, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
          else resolve(parsed);
        } catch { reject(new Error(`Parse error: ${data.slice(0, 300)}`)); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function dbQuery(pat, sql) {
  const body = JSON.stringify({ query: sql });
  return request({
    hostname: 'api.supabase.com',
    path: `/v1/projects/${PROJECT_REF}/database/query`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);
}

function authAdmin(serviceKey, method, path, body) {
  const b = body ? JSON.stringify(body) : null;
  return request({
    hostname: new URL(SUPABASE_URL).hostname,
    path: `/auth/v1/admin${path}`,
    method,
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
      ...(b ? { 'Content-Length': Buffer.byteLength(b) } : {}),
    },
  }, b);
}

async function getServiceRoleKey(pat) {
  const keys = await request({
    hostname: 'api.supabase.com',
    path: `/v1/projects/${PROJECT_REF}/api-keys`,
    method: 'GET',
    headers: { Authorization: `Bearer ${pat}` },
  });
  const k = keys.find(k => k.name === 'service_role');
  if (!k) throw new Error('service_role key not found in API response');
  return k.api_key;
}

async function createOrUpdateUser(serviceKey, account) {
  // Try to create first
  try {
    const user = await authAdmin(serviceKey, 'POST', '/users', {
      email: account.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: account.name,
        role: account.role,
        tenant_id: TENANT_ID,
      },
    });
    console.log(`  CREATED  ${account.email}  id=${user.id}`);
    return user.id;
  } catch (e) {
    if (!e.message.includes('already been registered') && !e.message.includes('already exists') && !e.message.includes('422')) {
      throw e;
    }
    // User already exists — find by email listing, then update
    console.log(`  EXISTS   ${account.email} — updating password & metadata`);
    const page = await authAdmin(serviceKey, 'GET', `/users?email=${encodeURIComponent(account.email)}&page=1&per_page=10`);
    const users = page.users || [];
    const existing = users.find(u => u.email === account.email);
    if (!existing) throw new Error(`Could not find existing user ${account.email} after creation conflict`);
    await authAdmin(serviceKey, 'PUT', `/users/${existing.id}`, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: account.name,
        role: account.role,
        tenant_id: TENANT_ID,
      },
    });
    console.log(`  UPDATED  ${account.email}  id=${existing.id}`);
    return existing.id;
  }
}

async function main() {
  const pat = fs.readFileSync(PAT_PATH, 'utf8').trim();
  console.log('Reading service role key...');
  const serviceKey = await getServiceRoleKey(pat);
  console.log('Got service role key.\n');

  // ── STEP 1: Create auth users ─────────────────────────────────────────────
  console.log('=== Creating auth users ===');
  const userIds = {};
  for (const acct of ACCOUNTS) {
    const id = await createOrUpdateUser(serviceKey, acct);
    userIds[acct.role] = id;
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }
  console.log('');

  // ── STEP 2: Ensure profiles are correct (trigger should have fired, but upsert to be safe) ──
  console.log('=== Upserting profiles ===');
  for (const acct of ACCOUNTS) {
    const id = userIds[acct.role];
    const sql = `
      INSERT INTO profiles (id, tenant_id, full_name, email, role, is_active)
      VALUES (
        '${id}',
        '${TENANT_ID}',
        '${acct.name.replace(/'/g, "''")}',
        '${acct.email}',
        '${acct.role}',
        true
      )
      ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        is_active = true;
    `;
    await dbQuery(pat, sql);
    console.log(`  profile upserted: ${acct.email} role=${acct.role}`);
  }
  console.log('');

  // ── STEP 3: Set onboarding_completed=true for sub ─────────────────────────
  console.log('=== Setting sub onboarding_completed ===');
  const subId = userIds['sub'];
  await dbQuery(pat, `
    UPDATE profiles SET onboarding_completed = true
    WHERE id = '${subId}';
  `);
  console.log(`  sub onboarding_completed=true set\n`);

  // ── STEP 4: Find suitable jobs ────────────────────────────────────────────
  console.log('=== Finding sandbox jobs ===');

  // Job with draws (for client portal Financials tab)
  const jobsWithDraws = await dbQuery(pat, `
    SELECT DISTINCT j.id, j.address, j.status, j.cost_plus
    FROM jobs j
    JOIN draw_schedules ds ON ds.job_id = j.id
    WHERE j.tenant_id = '${TENANT_ID}'
    ORDER BY j.address
    LIMIT 5;
  `);
  console.log(`  Jobs with draw_schedules: ${JSON.stringify(Array.isArray(jobsWithDraws) ? jobsWithDraws.map(r => r.id + ' "' + r.address + '"') : jobsWithDraws)}`);

  // Any job (fallback if no draws, or for sub engagement)
  const anyJobs = await dbQuery(pat, `
    SELECT id, address, status, cost_plus
    FROM jobs
    WHERE tenant_id = '${TENANT_ID}'
      AND status IN ('in_progress','contract','proposal','final_touches','complete')
    ORDER BY created_at DESC
    LIMIT 10;
  `);
  console.log(`  All active jobs: ${JSON.stringify(Array.isArray(anyJobs) ? anyJobs.map(r => r.id + ' "' + r.address + '" ' + r.status) : anyJobs)}`);
  console.log('');

  // Pick the client job
  let clientJobId = null;
  let clientJobTitle = null;
  if (Array.isArray(jobsWithDraws) && jobsWithDraws.length > 0) {
    clientJobId = jobsWithDraws[0].id;
    clientJobTitle = jobsWithDraws[0].address;
    console.log(`  Client will be linked to: "${clientJobTitle}" (has draws)`);
  } else if (Array.isArray(anyJobs) && anyJobs.length > 0) {
    clientJobId = anyJobs[0].id;
    clientJobTitle = anyJobs[0].address;
    console.log(`  WARNING: No jobs with draws found. Linking client to "${clientJobTitle}" (no draws — Financials tab may be empty)`);
  } else {
    console.log('  WARNING: No jobs found on tenant. Client account will see empty portal.');
  }

  // Pick the sub job (prefer same job so PM/Rep can see all roles on same job)
  const subJobId = clientJobId || (Array.isArray(anyJobs) && anyJobs.length > 0 ? anyJobs[0].id : null);
  const subJobTitle = clientJobTitle || (Array.isArray(anyJobs) && anyJobs.length > 0 ? anyJobs[0].address : null);

  // ── STEP 5: Link client to job ────────────────────────────────────────────
  const clientId = userIds['client'];
  if (clientJobId) {
    console.log(`\n=== Linking client to job ===`);
    // Check if client already linked to this or another job
    const existingLink = await dbQuery(pat, `
      SELECT id, address FROM jobs
      WHERE client_user_id = '${clientId}'
        AND tenant_id = '${TENANT_ID}'
      LIMIT 1;
    `);
    if (Array.isArray(existingLink) && existingLink.length > 0) {
      console.log(`  Client already linked to "${existingLink[0].address}" — keeping existing link`);
      console.log(`  Also ensuring client_user_id set on target draw job`);
    }
    await dbQuery(pat, `
      UPDATE jobs
      SET client_user_id = '${clientId}',
          client_email = 'client+test@avenstonekc.com'
      WHERE id = '${clientJobId}'
        AND tenant_id = '${TENANT_ID}';
    `);
    console.log(`  Linked client+test to job "${clientJobTitle}"`);
  }

  // ── STEP 6: Create sub engagement ─────────────────────────────────────────
  if (subJobId) {
    console.log(`\n=== Creating sub engagement ===`);
    const engCheck = await dbQuery(pat, `
      SELECT id, status FROM job_sub_engagements
      WHERE sub_id = '${subId}'
        AND tenant_id = '${TENANT_ID}'
      LIMIT 1;
    `);
    if (Array.isArray(engCheck) && engCheck.length > 0) {
      console.log(`  Sub already has engagement id=${engCheck[0].id} status=${engCheck[0].status} — skipping insert`);
    } else {
      await dbQuery(pat, `
        INSERT INTO job_sub_engagements (
          id, tenant_id, job_id, sub_id, trade, status, bid_type, created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          '${TENANT_ID}',
          '${subJobId}',
          '${subId}',
          'Framing',
          'active',
          'gc_drafted',
          now(),
          now()
        );
      `);
      console.log(`  Created active Framing engagement for sub+test on job "${subJobTitle}"`);
    }
  } else {
    console.log('\n  WARNING: No job available to create sub engagement. Sub portal may show empty.');
  }

  // ── STEP 7: Verify each account ───────────────────────────────────────────
  console.log('\n=== Verification ===');
  for (const acct of ACCOUNTS) {
    const id = userIds[acct.role];
    const profile = await dbQuery(pat, `
      SELECT id, tenant_id, full_name, email, role, is_active, onboarding_completed
      FROM profiles WHERE id = '${id}';
    `);
    const p = Array.isArray(profile) ? profile[0] : null;
    if (!p) {
      console.log(`  FAIL  ${acct.email} — no profile found`);
      continue;
    }
    const ok = p.tenant_id === TENANT_ID && p.role === acct.role && p.is_active;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${acct.email}`);
    console.log(`       role=${p.role}  tenant=${p.tenant_id === TENANT_ID ? 'AVENSTONE' : p.tenant_id}  active=${p.is_active}  onboarding=${p.onboarding_completed}`);
  }

  // Client job linkage check
  if (clientJobId) {
    const clientJobCheck = await dbQuery(pat, `
      SELECT id, address, client_user_id, client_email
      FROM jobs WHERE id = '${clientJobId}';
    `);
    const j = Array.isArray(clientJobCheck) ? clientJobCheck[0] : null;
    if (j && j.client_user_id === clientId) {
      console.log(`\n  CLIENT JOB: "${j.address}" → client_user_id MATCHES ✓`);
    } else {
      console.log(`\n  CLIENT JOB: link verification FAILED — expected ${clientId}, got ${j?.client_user_id}`);
    }
  }

  // Sub engagement check
  if (subJobId) {
    const subEngCheck = await dbQuery(pat, `
      SELECT jse.id, jse.status, jse.trade, j.address
      FROM job_sub_engagements jse
      JOIN jobs j ON j.id = jse.job_id
      WHERE jse.sub_id = '${subId}' AND jse.tenant_id = '${TENANT_ID}';
    `);
    if (Array.isArray(subEngCheck) && subEngCheck.length > 0) {
      console.log(`  SUB ENGAGEMENT: "${subEngCheck[0].address}" trade=${subEngCheck[0].trade} status=${subEngCheck[0].status} ✓`);
    } else {
      console.log(`  SUB ENGAGEMENT: none found — sub portal will be empty`);
    }
  }

  console.log('\n=== Done ===');
  console.log('Accounts (all password: Avenstone):');
  for (const acct of ACCOUNTS) {
    console.log(`  ${acct.email.padEnd(35)} role=${acct.role}  id=${userIds[acct.role]}`);
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
