// Generate 12101 Pawnee Ln proposal PDF using jsPDF (Node build)
// Reads live line items from DB, mimics buildProposalPDF format.
import { createRequire } from 'module';
import https from 'https';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { jsPDF } = require('../avenstone-vite/node_modules/jspdf/dist/jspdf.node.js');

const PAT    = process.env.SUPABASE_PAT; // set via: export SUPABASE_PAT=<your-pat>
const REF    = 'cbfftukmhqvvjlrlnltk';
const EST_ID = '605f7085-7607-4247-967c-5fc9e1fb23da';
const MARKUP = 0.30;
const PM_FEE = 1200;

function apiCall(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const opts = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${REF}/database/query`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(opts, res => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

const items = await apiCall(`
  SELECT trade, category, description, quantity, unit, unit_cost, total_cost, source_label, display_order
  FROM estimate_line_items
  WHERE estimate_id = '${EST_ID}'
  ORDER BY display_order
`);

const navy  = [10, 31, 68];
const gold  = [201, 168, 76];
const gray  = [107, 114, 128];
const SAFE  = 728;
const W = 612, M = 48, CW = W - M * 2;

const fmt = n => `$${Math.round(Number(n || 0)).toLocaleString()}`;
const san = s => String(s ?? '').replace(/['']/g,"'").replace(/[""]/g,'"').replace(/[–—]/g,'-').replace(/…/g,'...').replace(/[×]/g,'x');

const doc = new jsPDF({ unit: 'pt', format: 'letter' });
const T = (s, x, y, opts) => doc.text(san(s), x, y, opts);
const wrap = (s, w) => doc.splitTextToSize(san(s), w);
const chk = (y, h = 16) => { if (y + h > SAFE) { doc.addPage(); return M + 8; } return y; };

// ── Header ──────────────────────────────────────────────────────────────────
doc.setFillColor(...navy); doc.rect(0, 0, W, 80, 'F');
doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...gold);
T('AVENSTONE GROUP', M, 34);
doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gold);
T('PROPOSAL', M, 50);
doc.setTextColor(200, 200, 200); doc.setFontSize(9);
T('avenstonekc.com  ·  Kansas City, MO', W - M, 34, { align: 'right' });
T('Proposal #: P-20260717', W - M, 50, { align: 'right' });

// ── Job block ───────────────────────────────────────────────────────────────
let y = 100;
doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(...navy);
T('12101 Pawnee Ln, Leawood KS 66209', M, y); y += 18;
doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gray);
T('Purchase-Contingent Renovation Estimate', M, y); y += 14;
T(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, M, y); y += 20;
doc.setDrawColor(...gold); doc.setLineWidth(1.5); doc.line(M, y, W - M, y); y += 16;

// ── EXCLUSIONS callout ──────────────────────────────────────────────────────
const exclusions = [
  'Fence (pending Leawood ordinance check)',
  'Asbestos abatement if VCT test positive (change order)',
  'Master bath glass door',
  'Garage floor leveling / drain abandonment',
  'Vault/beam-area painting in Living',
  'Counters + faucets outside master bath',
];
doc.setFontSize(8);
const excLines = exclusions.map(e => wrap(`•  ${e}`, CW - 16));
const boxH = 18 + excLines.reduce((s, ls) => s + ls.length * 10, 0) + 8;
doc.setFillColor(254, 243, 199); doc.setDrawColor(...gold); doc.setLineWidth(1);
doc.rect(M, y, CW, boxH, 'FD');
doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(120, 80, 0);
T('EXCLUSIONS — NOT IN BASE SCOPE', M + 8, y + 11);
let ey = y + 22;
doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 50, 0);
excLines.forEach(ls => { doc.text(ls, M + 8, ey); ey += ls.length * 10; });
y += boxH + 12;

// ── Line items by trade ─────────────────────────────────────────────────────
const hardCost = items.reduce((s, li) => s + Number(li.total_cost || 0), 0);
const trades = [];
const tmap = {};
items.forEach(li => {
  const t = li.trade || 'General';
  if (!tmap[t]) { tmap[t] = []; trades.push(t); }
  tmap[t].push(li);
});

y = chk(y, 28);
doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy);
T('SCOPE & PRICING', M, y); y += 14;

// Table header
doc.setFillColor(...navy); doc.rect(M, y - 10, CW, 16, 'F');
doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...gold);
T('DESCRIPTION', M + 4, y);
T('QTY / UNIT', M + 330, y);
T('COST', W - M, y, { align: 'right' });
y += 10;

let rowIdx = 0;
const TITLE_CASE_KEEP = new Set(['HVAC','PM','GC','LVP','LVT','ADA','MDF','PVC','T+G']);
const tc = s => String(s || '').split(/\s+/).map(w => {
  const up = w.toUpperCase();
  return TITLE_CASE_KEEP.has(up) ? up : (w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}).join(' ');

trades.forEach(trade => {
  const tItems = tmap[trade];
  const tradeSub = tItems.reduce((s, li) => s + Number(li.total_cost || 0), 0);

  y = chk(y, 20);
  doc.setFillColor(232, 226, 210); doc.rect(M, y - 2, CW, 16, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...navy);
  T(tc(trade), M + 4, y + 10); y += 16;

  tItems.forEach(li => {
    const isAllow = /allowance/i.test(li.description || '');
    doc.setFont('helvetica', isAllow ? 'italic' : 'normal'); doc.setFontSize(8.5); doc.setTextColor(55, 65, 81);
    const descLines = wrap(li.description || '', 316);
    const rowH = Math.max(14, descLines.length * 10 + 6) + (isAllow ? 10 : 0);

    y = chk(y, rowH);
    doc.setFillColor(rowIdx % 2 === 0 ? 255 : 250, rowIdx % 2 === 0 ? 255 : 249, rowIdx % 2 === 0 ? 255 : 247);
    doc.rect(M, y - 2, CW, rowH, 'F');
    doc.setFont('helvetica', isAllow ? 'italic' : 'normal'); doc.setFontSize(8.5); doc.setTextColor(55, 65, 81);
    descLines.forEach((line, i) => doc.text(line, M + 4, y + 8 + i * 10));

    const qtyStr = [li.quantity != null ? String(Number(li.quantity)) : '', li.unit || ''].filter(Boolean).join(' ');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...gray);
    T(qtyStr, M + 330, y + 8);

    const isGap = li.source_label === 'regional_avg';
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...navy);
    T(fmt(li.total_cost), W - M, y + 8, { align: 'right' });
    if (isGap) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(146, 64, 14);
      T('gap', W - M - 2, y + 17, { align: 'right' });
    }
    if (isAllow) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(146, 100, 14);
      T('(allowance)', W - M, y + 18, { align: 'right' });
    }
    y += rowH; rowIdx++;
  });

  y = chk(y, 16);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...gray);
  T(`${tc(trade)} subtotal`, M + 4, y + 8);
  doc.setTextColor(...navy); T(fmt(tradeSub), W - M, y + 8, { align: 'right' });
  doc.setDrawColor(220, 215, 200); doc.setLineWidth(0.5); doc.line(M, y + 13, W - M, y + 13);
  y += 18;
});

// ── Summary ─────────────────────────────────────────────────────────────────
y = chk(y, 80);
doc.setDrawColor(...gold); doc.setLineWidth(1.5); doc.line(M, y, W - M, y); y += 14;
const markup = hardCost * MARKUP;
const grandTotal = hardCost + markup + PM_FEE;

[
  ['Hard Cost Subtotal', fmt(hardCost)],
  [`Markup (${Math.round(MARKUP*100)}%)`, fmt(markup)],
  ['PM Fee', fmt(PM_FEE)],
].forEach(([label, val]) => {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...gray);
  T(label, M, y); doc.setTextColor(...navy); T(val, W - M, y, { align: 'right' }); y += 15;
});
y += 4;
doc.setFillColor(...navy); doc.rect(M, y - 2, CW, 24, 'F');
doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
T('ESTIMATED TOTAL', M + 8, y + 16);
doc.setTextColor(...gold); T(fmt(grandTotal), W - M - 4, y + 16, { align: 'right' });
y += 34;

// ── Notes ───────────────────────────────────────────────────────────────────
y = chk(y, 80);
doc.setDrawColor(...gold); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 14;
doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...navy);
T('NOTES & CONDITIONS', M, y); y += 12;
const notes = [
  'Items marked "gap" are priced at KC regional averages — no vetted book rate on file; confirm with subs before contract.',
  'VCT floor demo (Basement, 2,478 SF) is contingent on asbestos test. Positive result = change order, not in base.',
  'Master Bath floor area (~160 SF) requires site measurement — scanner could not resolve room behind mirror walls.',
  'Electrical house-wide (outlets/switches) is a device-swap scope — outlet_switch book rate does not apply; rate book needs a swap/replace entry.',
  'Garage doors (3 units): door units not in rate book. Anchor used. Confirm mid-range steel spec with vendor.',
  'All wood finishes stay natural. No trim paint anywhere in house. Paint = walls (+ ceiling only where stated).',
];
doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(55, 65, 81);
notes.forEach(n => {
  const lines = wrap(`•  ${n}`, CW);
  y = chk(y, lines.length * 10 + 4);
  doc.text(lines, M, y); y += lines.length * 10 + 3;
});

// ── Footer ──────────────────────────────────────────────────────────────────
const pages = doc.getNumberOfPages();
const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
for (let i = 1; i <= pages; i++) {
  doc.setPage(i);
  doc.setFillColor(...navy); doc.rect(0, 772, W, 40, 'F');
  doc.setFontSize(8); doc.setTextColor(...gold); doc.setFont('helvetica', 'bold');
  T('AVENSTONE GROUP LLC', M, 788);
  doc.setTextColor(180, 180, 180); doc.setFont('helvetica', 'normal');
  T(`Page ${i} of ${pages}  ·  Valid 30 days from date of issue`, W / 2, 788, { align: 'center' });
  T(now, W - M, 788, { align: 'right' });
}

const outPath = 'C:/Users/Kalin/OneDrive/Desktop/pawnee-scans/Pawnee_Estimate_12101.pdf';
fs.writeFileSync(outPath, Buffer.from(doc.output('arraybuffer')));
console.log(`PDF saved to ${outPath}`);
console.log(`Pages: ${pages}`);
console.log(`Hard cost: $${Math.round(hardCost).toLocaleString()}`);
console.log(`Grand total: $${Math.round(grandTotal).toLocaleString()}`);
console.log(`Gap items: ${items.filter(i => i.source_label === 'regional_avg').length} of ${items.length}`);
