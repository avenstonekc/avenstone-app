/**
 * TEST_JOB_CLEANUP — storage sweep for the 25 deleted test jobs.
 * Run BEFORE the DB migration (needs the rows to resolve exact object paths).
 * Removes by EXPLICIT (bucket, path) — never by folder prefix (some paths are tenant- or
 * `test/`/`consultation/`-prefixed; a prefix delete could nuke shared/other-job objects).
 * Guard: skips any path also referenced by a KEPT job.
 *   node tools/cleanup_test_jobs_storage.cjs         # dry run (lists, removes nothing)
 *   node tools/cleanup_test_jobs_storage.cjs --apply # actually remove
 */
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://cbfftukmhqvvjlrlnltk.supabase.co';
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYxNDY4OCwiZXhwIjoyMDkxMTkwNjg4fQ.oa4fqY82eLMUmq8egx1IOtBbOi-2Q5ofP1e0NU0ZmNs';
const sb = createClient(SB, SVC, { auth: { persistSession: false } });
const APPLY = process.argv.includes('--apply');

const DEL = ['6a6bf561-1199-4659-bd4e-3e21c90fd228','8d5f5391-e7cc-454b-a4e8-32674925fd7f','93d28a78-eee2-4d65-afdc-0cd2c4ab9b0c','25391e4f-f66d-481f-9bc8-c49b2c05c343','0b10eebe-fef6-44df-b6f5-29628dfb20aa','be34ecc8-69c7-4941-8682-51c69e3f6925','8a0a8aa6-dd02-4a70-a831-949348b2ab43','0c5ec979-831e-4d6c-9fa0-bb9664bc2c3c','eaf3c4fb-8283-4f44-85fb-02a4bfec3526','ffdce472-f973-485a-8188-3a7c643f701b','b2899c06-7352-41d2-9ba2-59b1a70ae72d','6dea93fc-3068-4d6e-a6ec-bb3346f25a32','e4720494-d3f2-4adc-9391-fed6ddc1b3b7','be5803f9-9886-464f-a87c-0566320e9541','3bbc3c63-b7f8-48d5-8734-76e4bd3d2740','7d4b24b3-14cd-4c67-be7d-587d74ea1883','b7757406-2a41-4242-b80c-2b08f87d8685','3d4881de-6e25-4959-b7a7-113a961f473c','5aa81533-c723-4705-babc-04eff442c372','e9a46af4-e34c-491f-b3a8-8eaa7380b198','a445463f-98f6-4c6b-a367-b676137dc9c7','8d2c76a0-7385-46d6-9036-ba3664d38c17','c68495d9-f913-40a7-9204-1b6b34aeb9b0','7b44611a-854d-407e-ac8f-9c4b61b62d6d','5cb49d86-6cb6-4685-8582-c5c8888df970'];
const KEEP = ['58345dc5-ecae-4f6f-b502-cac80d6c43be','4460936c-3eb1-4abf-90d4-b3de99a8227f','b720f17f-0f69-4477-adcf-7c02115b4b0d','7e0e357b-a0c4-47dd-89c7-f8a7c4e8c342','5ebd7c3c-c4a7-450c-b529-479903668010','ebe370cf-76cc-4912-aaf1-d2d2d0eee413','ac92d901-3461-48e8-8fa2-26e220a5ab5b','b5c413fa-5a89-40a0-b88a-37a6e69993e6'];

const key = (b, p) => `${b}||${p}`;
// Strip a full storage URL down to its object path; leave clean paths as-is.
const toPath = (v, bucket) => {
  if (!v) return null;
  const m = String(v).match(new RegExp(`/object/(?:public|sign)/${bucket}/(.+?)(?:\\?|$)`));
  return m ? decodeURIComponent(m[1]) : String(v);
};

// Collect every (bucket, path) storage object referenced by a set of job ids.
async function collect(ids) {
  const out = [];
  const push = (b, p) => { const pp = toPath(p, b); if (pp) out.push({ bucket: b, path: pp }); };
  const jf = (await sb.from('job_files').select('job_id,storage_bucket,storage_path').in('job_id', ids)).data || [];
  jf.forEach(r => r.storage_bucket && r.storage_path && push(r.storage_bucket, r.storage_path));
  const tx = (await sb.from('job_transactions').select('job_id,receipt_url,lien_waiver_url').in('job_id', ids)).data || [];
  tx.forEach(r => { if (r.receipt_url) push('job-receipts', r.receipt_url); if (r.lien_waiver_url) push('job-documents', r.lien_waiver_url); });
  const cp = (await sb.from('consultation_photos').select('job_id,storage_path').in('job_id', ids)).data || [];
  cp.forEach(r => r.storage_path && push('consultation-photos', r.storage_path));
  const ph = (await sb.from('photos').select('job_id,url').in('job_id', ids)).data || [];
  ph.forEach(r => r.url && push('job-photos', r.url));
  const dp = (await sb.from('draw_packages').select('job_id,generated_pdf_path').in('job_id', ids)).data || [];
  dp.forEach(r => r.generated_pdf_path && push('draw-packages', r.generated_pdf_path));
  const jd = (await sb.from('job_documents').select('job_id,file_url').in('job_id', ids)).data || [];
  jd.forEach(r => r.file_url && push('job-documents', r.file_url));
  // dedup
  const seen = new Set(); return out.filter(o => { const k = key(o.bucket, o.path); if (seen.has(k)) return false; seen.add(k); return true; });
}

(async () => {
  const delObjs = await collect(DEL);
  const keepObjs = await collect(KEEP);
  const protectedSet = new Set(keepObjs.map(o => key(o.bucket, o.path)));

  const toRemove = delObjs.filter(o => !protectedSet.has(key(o.bucket, o.path)));
  const skipped = delObjs.filter(o => protectedSet.has(key(o.bucket, o.path)));

  console.log(`\nTEST_JOB_CLEANUP storage sweep — ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`  delete-job objects found: ${delObjs.length}`);
  console.log(`  protected (also on a kept job) → skipped: ${skipped.length}`);
  skipped.forEach(o => console.log(`    SKIP ${o.bucket}/${o.path}`));
  console.log(`  to remove: ${toRemove.length}`);

  const byBucket = {};
  toRemove.forEach(o => (byBucket[o.bucket] = byBucket[o.bucket] || []).push(o.path));

  let removed = 0, failed = 0;
  for (const [bucket, paths] of Object.entries(byBucket)) {
    for (const p of paths) console.log(`    ${APPLY ? 'RM' : 'would rm'} ${bucket}/${p}`);
    if (APPLY) {
      const { data, error } = await sb.storage.from(bucket).remove(paths);
      if (error) { console.log(`    ✗ ${bucket}: ${error.message}`); failed += paths.length; }
      else { removed += (data || []).length; }
    }
  }
  console.log(`\nSUMMARY: ${APPLY ? `removed ${removed}, failed ${failed}` : `${toRemove.length} would be removed`} (skipped ${skipped.length})`);
})();
