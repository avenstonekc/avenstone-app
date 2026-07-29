/**
 * PAPERWORK_LEGACY_SWEEP — move legacy sub W-9 uploads out of the shared, authenticated-readable
 * `job-documents` bucket (under `w9/*`, referenced by tenant-readable `profiles.w9_url`) into the
 * private, owner+self `employee-docs` bucket that Slice 2b established. These files contain TINs.
 *
 * IDEMPOTENT — safe to re-run:
 *   - Real files (a `profiles.w9_url` pointing at `w9/...`): copy → verify byte-size → UPDATE
 *     profiles.w9_url to the new employee-docs path → delete the original.
 *   - Orphan `w9/*` objects referenced by no profile (test artifacts): deleted outright.
 *   - Profiles already on employee-docs paths are skipped (the `w9/` filter excludes them).
 *
 * Run: node tools/migrate_legacy_w9.cjs
 * Service role (bypasses RLS) — read the key from the env, not this file.
 */
const { createClient } = require('@supabase/supabase-js');

const SB = 'https://cbfftukmhqvvjlrlnltk.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE) { console.error('Set SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const admin = createClient(SB, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

(async () => {
  const moved = []; const orphans = []; const errors = [];

  // 1. Real files: profiles whose w9_url still points at the legacy job-documents/w9/ path.
  const { data: legacy, error: pErr } = await admin.from('profiles').select('id, email, w9_url').like('w9_url', 'w9/%');
  if (pErr) { console.error('profiles query:', pErr.message); process.exit(1); }

  for (const p of (legacy || [])) {
    try {
      const oldPath = p.w9_url;
      const dl = await admin.storage.from('job-documents').download(oldPath);
      if (dl.error) throw new Error('download: ' + dl.error.message);
      const srcBytes = new Uint8Array(await dl.data.arrayBuffer());
      const newPath = `${p.id}/w9_${Date.parse(new Date().toISOString())}.pdf`;
      const up = await admin.storage.from('employee-docs').upload(newPath, srcBytes, { contentType: 'application/pdf', upsert: true });
      if (up.error) throw new Error('upload: ' + up.error.message);
      // verify byte-size match
      const chk = await admin.storage.from('employee-docs').download(newPath);
      const dstLen = chk.error ? -1 : (await chk.data.arrayBuffer()).byteLength;
      if (dstLen !== srcBytes.byteLength) throw new Error(`size mismatch ${srcBytes.byteLength} != ${dstLen}`);
      await admin.from('profiles').update({ w9_url: newPath }).eq('id', p.id);
      await admin.storage.from('job-documents').remove([oldPath]);
      moved.push({ user: p.email, old: oldPath, new: newPath, bytes: srcBytes.byteLength });
    } catch (e) { errors.push({ user: p.email, error: e.message }); }
  }

  // 2. Orphan legacy objects (w9/* referenced by no profile) — test artifacts, delete.
  const { data: objs } = await admin.storage.from('job-documents').list('w9', { limit: 1000 });
  const referenced = new Set((legacy || []).map(p => p.w9_url));
  for (const o of (objs || [])) {
    const full = `w9/${o.name}`;
    if (referenced.has(full)) continue; // handled above (already deleted after move)
    const del = await admin.storage.from('job-documents').remove([full]);
    if (del.error) errors.push({ orphan: full, error: del.error.message });
    else orphans.push(full);
  }

  console.log(JSON.stringify({ moved, orphansDeleted: orphans, errors, summary: { moved: moved.length, orphans: orphans.length, errors: errors.length } }, null, 2));
})();
