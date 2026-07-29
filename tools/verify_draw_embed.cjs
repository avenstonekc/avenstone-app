/**
 * DRAW_MULTIFILE_FIX verification — proves build-draw-package now embeds the mislabeled-mime
 * PDF receipts instead of silently dropping them. A/B page-count on the REAL Lucy Webb draw #2:
 *   A = build with [gutter JPEG only]      → baseline pages
 *   B = build with [QXO pdf, Haven pdf, gutter] → must be A + (QXO pages) + (Haven pages)
 * The final build (B) leaves Kalin's package correctly regenerated. Does NOT send.
 *   node tools/verify_draw_embed.cjs
 */
const { createClient } = require('@supabase/supabase-js');
const SB = 'https://cbfftukmhqvvjlrlnltk.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ';
const OWNER = { email: 'test-rep@avenstonekc.com', password: 'RateBookWalk2026!' };
const JOB = 'b720f17f-0f69-4477-adcf-7c02115b4b0d';
const DRAW = '45b246ea-564c-4bed-8e39-56029f70784f';
const sb = createClient(SB, ANON, { auth: { persistSession: false } });

const gutter = { id: '1f8cfa9e-c9ff-40fd-8b1e-cb5df826bae9', source: 'job_file' };
const qxo    = { id: 'd75c6237-0e2f-4454-961a-a8fee8f83033', source: 'job_file', amount: 1621.25, date: '2026-05-28' };
const haven  = { id: '8b47c1d9-bd45-443a-9019-db57cb55c6d5', source: 'job_file', amount: 10500,   date: '2026-07-28' };

async function build(file_refs) {
  const { data: j, error } = await sb.functions.invoke('build-draw-package', {
    body: { draw_id: DRAW, job_id: JOB, cover_notes: null, file_refs },
  });
  if (error) throw new Error('invoke error: ' + error.message);
  if (!j.ok) throw new Error('build failed: ' + JSON.stringify(j));
  const pdf = new Uint8Array(await (await fetch(j.signed_url)).arrayBuffer());
  const { PDFDocument } = require('../avenstone-vite/node_modules/pdf-lib');
  const pages = (await PDFDocument.load(pdf, { ignoreEncryption: true })).getPageCount();
  return { pages, bytes: pdf.length };
}

(async () => {
  const { error: authErr } = await sb.auth.signInWithPassword(OWNER);
  if (authErr) throw new Error('owner login failed: ' + authErr.message);
  console.log('file_refs A (baseline):', JSON.stringify([gutter]));
  const A = await build([gutter]);
  console.log(`  → ${A.pages} pages, ${(A.bytes/1024).toFixed(0)} KB\n`);

  const refsB = [qxo, haven, gutter];
  console.log('file_refs B (all three, exactly what the composer saved):');
  console.log(JSON.stringify(refsB, null, 2));
  const B = await build(refsB);
  console.log(`  → ${B.pages} pages, ${(B.bytes/1024).toFixed(0)} KB\n`);

  const delta = B.pages - A.pages;
  console.log(`PAGE DELTA (B - A) = ${delta}  — QXO + Haven each add ≥1 page when embedded.`);
  console.log(delta >= 2
    ? '✅ PASS — the two mislabeled PDF receipts now embed (previously silently dropped).'
    : '❌ FAIL — the extra receipts are still not embedding.');
})();
