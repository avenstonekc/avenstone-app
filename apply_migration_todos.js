#!/usr/bin/env node
// apply_migration_todos.js
// Usage: node apply_migration_todos.js <PAT>
const fs = require('fs');
const path = require('path');

const PAT = process.argv[2];
if (!PAT) { console.error('Usage: node apply_migration_todos.js <PAT>'); process.exit(1); }

const PROJECT_REF = 'cbfftukmhqvvjlrlnltk';
const MIGRATION_FILE = path.join(__dirname, 'supabase/migrations/20260507100000_todos.sql');

const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');

async function run() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json();
  if (!res.ok) { console.error('Migration failed:', JSON.stringify(body, null, 2)); process.exit(1); }
  console.log('Migration applied successfully.');

  // Verify
  const verify = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='todos'
      ORDER BY ordinal_position;
    `}),
  });
  const cols = await verify.json();
  console.log('\nColumns:', JSON.stringify(cols, null, 2));

  const pol = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `SELECT policyname FROM pg_policies WHERE tablename='todos';` }),
  });
  const policies = await pol.json();
  console.log('\nPolicies:', JSON.stringify(policies, null, 2));

  const idx = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `SELECT indexname FROM pg_indexes WHERE tablename='todos';` }),
  });
  const indexes = await idx.json();
  console.log('\nIndexes:', JSON.stringify(indexes, null, 2));
}

run().catch(e => { console.error(e); process.exit(1); });
