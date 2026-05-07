// Run: node apply_migration_canonical.js <PAT>
// Applies: 20260506200000_jobs_status_canonical.sql
// Supersedes: 20260506190000_jobs_status_lifecycle_lock.sql (drops its constraint first)
const pat = process.argv[2];
if (!pat) { console.error('Usage: node apply_migration_canonical.js <PAT>'); process.exit(1); }

const sql = `
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_lifecycle_check;
UPDATE jobs SET status = 'proposal'    WHERE status = 'bid_sent';
UPDATE jobs SET status = 'in_progress' WHERE status = 'active';
ALTER TABLE jobs
  ADD CONSTRAINT jobs_status_canonical_check
  CHECK (status IN ('lead','proposal','contract','in_progress','final_touches','complete','on_hold'));
ALTER TABLE jobs ALTER COLUMN status SET DEFAULT 'lead';
COMMENT ON COLUMN jobs.status IS
  'Canonical 6-phase lifecycle: lead → proposal → contract → in_progress → final_touches → complete. White-label-driven.';
NOTIFY pgrst, 'reload schema';
`;

const BASE = 'https://api.supabase.com/v1/projects/cbfftukmhqvvjlrlnltk/database/query';
const H = { 'Authorization': 'Bearer ' + pat, 'Content-Type': 'application/json' };

fetch(BASE, { method: 'POST', headers: H, body: JSON.stringify({ query: sql }) })
  .then(r => r.json())
  .then(d => {
    if (d.error) { console.error('Migration failed:', JSON.stringify(d)); process.exit(1); }
    console.log('Migration applied.');
    return fetch(BASE, { method: 'POST', headers: H, body: JSON.stringify({ query: `SELECT status, count(*) FROM jobs GROUP BY status ORDER BY count DESC;` }) });
  })
  .then(r => r.json())
  .then(v => {
    console.log('Row counts after backfill:');
    (v || []).forEach(row => console.log(' ', row.status, '-', row.count));
    console.log('Expected: only canonical values (lead, proposal, contract, in_progress, final_touches, complete, on_hold)');
  });
