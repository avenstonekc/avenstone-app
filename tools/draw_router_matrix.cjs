/**
 * DRAW_MULTIFILE router matrix — proves which file types embed vs silently drop.
 * Builds against the CANCELLED sandbox draw (no real client package touched) and reads the
 * embed_stats the fn now returns. A drop = *_found > *_embedded. Singletons pinpoint each
 * dropping file; combos confirm no interaction bug.
 *   node tools/draw_router_matrix.cjs
 */
const { createClient } = require('@supabase/supabase-js');
const { PDFDocument } = require('../avenstone-vite/node_modules/pdf-lib');
const SB = 'https://cbfftukmhqvvjlrlnltk.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ';
const REP = { email: 'test-rep@avenstonekc.com', password: 'RateBookWalk2026!' };
const JOB  = '5ebd7c3c-c4a7-450c-b529-479903668010';       // 999 Cost Plus Sandbox — DO NOT BILL
const DRAW = '74be96c2-e6ae-47fa-8aee-e9f1d346e0cf';       // cancelled sandbox draw #8
const sb = createClient(SB, ANON, { auth: { persistSession: false } });

const F = {
  jpg_img:      { label: 'image/jpeg  .jpg   (real jpeg, Receipts)',        id: 'ee69992b-dda4-4b37-90ad-f27b04e0c10f' },
  jpeg_img:     { label: 'image/jpeg  .jpeg  (real jpeg, Receipts)',        id: '9394929d-c9fe-43c6-8db7-7337372acadf' },
  pdf_real1:    { label: 'application/pdf  .pdf  (real PDF, Documents)',    id: '7d26c132-0670-4568-b035-f812f0c94798' },
  pdf_real2:    { label: 'application/pdf  .pdf  (real PDF, Receipts)',     id: '892f463d-1de1-44ab-a4d3-2f8cebbb83f3' },
  pdf_as_jpeg:  { label: 'mime image/jpeg + .pdf ext (actually PDF)',       id: '8b47c1d9-bd45-443a-9019-db57cb55c6d5' },
  png_real:     { label: 'image/png  .png   (real png, Receipts)',         id: 'a5a308ba-af89-4959-bc62-68133e7ca93c' },
  jpeg_ext_png: { label: 'mime image/jpeg + .png ext (mislabeled)',        id: '2af619c6-951d-44c9-86df-dc38c9d86425' },
  photo:        { label: 'image/jpeg  .jpeg  (Photos branch)',             id: 'c8fb3989-b197-4951-8b2f-85e05f57cba8' },
};
const ref = k => ({ id: F[k].id, source: 'job_file' });

async function build(refs) {
  const { data: j, error } = await sb.functions.invoke('build-draw-package', {
    body: { draw_id: DRAW, job_id: JOB, cover_notes: null, file_refs: refs.map(ref) },
  });
  if (error) return { err: 'invoke: ' + error.message };
  if (!j.ok) return { err: 'build: ' + JSON.stringify(j) };
  let pages = null;
  try {
    const pdf = new Uint8Array(await (await fetch(j.signed_url)).arrayBuffer());
    pages = (await PDFDocument.load(pdf, { ignoreEncryption: true })).getPageCount();
  } catch {}
  return { stats: j.embed_stats, pages };
}

async function run(name, keys) {
  const r = await build(keys);
  if (r.err) { console.log(`\n### ${name}\n  files: ${keys.join(', ')}\n  ERROR: ${r.err}`); return; }
  const s = r.stats || {};
  const found     = (s.photos_found || 0) + (s.documents_found || 0);
  const embed     = (s.photos_embedded || 0) + (s.documents_embedded || 0);
  const placeheld = (s.documents_placeholdered || 0);
  const silent    = found - embed - placeheld; // truly dropped (no page at all)
  const flag = silent > 0 ? `  <<< SILENT DROP ${silent}` : placeheld > 0 ? `  (placeholder ${placeheld})` : '';
  console.log(`\n### ${name}${flag}`);
  keys.forEach(k => console.log(`  - ${F[k].label}`));
  console.log(`  embed_stats: refs=${s.refs_received} resolved=${s.files_resolved} ` +
              `photos=${s.photos_found}/${s.photos_embedded} docs=${s.documents_found}/${s.documents_embedded} ` +
              `placeholder=${placeheld}  pages=${r.pages}`);
  if (s.unrenderable && s.unrenderable.length)
    console.log(`  unrenderable: ${s.unrenderable.map(u => `${u.name}[${u.mime_type}]`).join(', ')}`);
}

(async () => {
  const { error } = await sb.auth.signInWithPassword(REP);
  if (error) throw new Error('rep login failed: ' + error.message);
  console.log('=== SINGLETONS (pinpoint each dropping file) ===');
  for (const k of Object.keys(F)) await run(`single: ${k}`, [k]);

  console.log('\n\n=== COMBOS (matrix requested) ===');
  await run('two images',        ['jpg_img', 'png_real']);
  await run('two PDFs',          ['pdf_real1', 'pdf_real2']);
  await run('one image + PDF',   ['jpg_img', 'pdf_real1']);
  await run('unusual mimes',     ['pdf_as_jpeg', 'jpeg_ext_png']);
})();
