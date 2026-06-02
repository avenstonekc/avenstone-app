import jsPDF from 'jspdf';
import { markupRateForCategory } from './markupConfig.js';
import { floorLabel as _floorLabel } from './captureTypes.js';
import logoUrl from '../assets/logo.png';
import polylabel from 'polylabel';
import polygonClipping from 'polygon-clipping';
import { normalizeFloorPlan } from './floorPlan/normalize.js';
import { computeLayoutHints } from './floorPlan/layoutCheck.js';

const FLOOR_TINT = [248, 245, 240];

const _loadLogo = () => new Promise(resolve => {
  fetch(logoUrl)
    .then(r => r.blob())
    .then(blob => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    })
    .catch(() => resolve(null));
});

// ─── Floor plan edit overrides ─────────────────────────────────────────────
// Applied to a scan dict before any other processing. Returns a new scan with:
//   - room names replaced from overrides.room_names[idx]
//   - all coordinates rotated by overrides.rotation (0/90/180/270)
//   - then mirrored if overrides.mirror is 'horizontal' or 'vertical'
// Editor and PDF call this with the same overrides → they render identically.
export const applyEditOverrides = (scan) => {
  if (!scan || !scan.edit_overrides) return scan;
  const ov = scan.edit_overrides || {};
  const rot = ((ov.rotation || 0) % 360 + 360) % 360;
  const mh = ov.mirror === 'horizontal';
  const mv = ov.mirror === 'vertical';
  const names = ov.room_names || {};

  // 90° increments only — exact integer math, no trig drift.
  const rotXZ = (x, z) => {
    if (rot === 0)   return [x, z];
    if (rot === 90)  return [-z, x];
    if (rot === 180) return [-x, -z];
    if (rot === 270) return [z, -x];
    return [x, z];
  };
  const tx = (x, z) => {
    let [nx, nz] = rotXZ(x, z);
    if (mh) nx = -nx;
    if (mv) nz = -nz;
    return [nx, nz];
  };
  const txSeg = (s) => {
    const [x1, z1] = tx(s.x1, s.z1);
    const [x2, z2] = tx(s.x2, s.z2);
    const out = { ...s, x1, z1, x2, z2 };
    if (typeof s.nx === 'number' && typeof s.nz === 'number') {
      const [nx, nz] = tx(s.nx, s.nz);
      out.nx = nx; out.nz = nz;
    }
    return out;
  };

  const newRooms = (scan.rooms || []).map((r, i) => {
    const nr = { ...r };
    if (names[String(i)]) nr.name = names[String(i)];
    if (typeof r.worldX === 'number' && typeof r.worldZ === 'number') {
      const [nwx, nwz] = tx(r.worldX, r.worldZ);
      nr.worldX = nwx; nr.worldZ = nwz;
    }
    if (Array.isArray(r.wallSegments))    nr.wallSegments    = r.wallSegments.map(txSeg);
    if (Array.isArray(r.doorSegments))    nr.doorSegments    = r.doorSegments.map(txSeg);
    if (Array.isArray(r.windowSegments))  nr.windowSegments  = r.windowSegments.map(txSeg);
    if (Array.isArray(r.openingSegments)) nr.openingSegments = r.openingSegments.map(txSeg);
    if (Array.isArray(r.objects)) {
      nr.objects = r.objects.map((o) => {
        const [ox, oz] = tx(o.x, o.z);
        const out = { ...o, x: ox, z: oz };
        if (typeof o.rotationY === 'number') {
          out.rotationY = o.rotationY + (rot * Math.PI / 180);
          if (mh) out.rotationY = -out.rotationY;
          if (mv) out.rotationY = Math.PI - out.rotationY;
        }
        return out;
      });
    }
    return nr;
  });

  return { ...scan, rooms: newRooms };
};

// ─── Generic PDF (contract, signoff, etc.) ────────────────────────────────────
export const buildGenericPDF = ({ docType, job, bodyText, signaturePng }) => {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const navy = [10, 31, 68], gold = [201, 168, 76], gray = [107, 114, 128];
  const W = 612, M = 48, CW = W - M * 2;

  doc.setFillColor(...navy); doc.rect(0, 0, W, 80, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...gold);
  doc.text('AVENSTONE GROUP', M, 34);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gold);
  doc.text(docType, M, 50);
  doc.setTextColor(200, 200, 200); doc.setFontSize(9);
  doc.text('avenstonekc.com · Kansas City, MO', W - M, 34, { align: 'right' });

  let y = 100;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...navy);
  doc.text(job.address || '', M, y); y += 16;
  if (job.client_name) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gray); doc.text(`Client: ${job.client_name}`, M, y); y += 14; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gray);
  doc.text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, M, y); y += 24;

  doc.setDrawColor(...gold); doc.setLineWidth(1.5); doc.line(M, y, W - M, y); y += 20;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(55, 65, 81);
  const lines = doc.splitTextToSize(bodyText, CW);
  lines.forEach(line => { if (y > 710) { doc.addPage(); y = 60; } doc.text(line, M, y); y += 13; });

  if (signaturePng) {
    y += 20;
    if (y > 660) { doc.addPage(); y = 60; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...navy);
    doc.text('Signed:', M, y); y += 8;
    try { doc.addImage(signaturePng, 'PNG', M, y, 200, 60); } catch (e) {}
    y += 70;
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5); doc.line(M, y, M + 200, y);
    y += 12; doc.setFontSize(8); doc.setTextColor(...gray); doc.text('Client Signature', M, y);
  }

  const pages = doc.getNumberOfPages();
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(...navy); doc.rect(0, 772, W, 40, 'F');
    doc.setFontSize(8); doc.setTextColor(...gold); doc.setFont('helvetica', 'bold');
    doc.text('AVENSTONE GROUP LLC', M, 788);
    doc.setTextColor(180, 180, 180); doc.setFont('helvetica', 'normal');
    doc.text(`Page ${i} of ${pages}`, W / 2, 788, { align: 'center' });
    doc.text(now, W - M, 788, { align: 'right' });
  }
  return doc;
};

// ─── Estimate PDF ──────────────────────────────────────────────────────────────
export const buildEstimatePDF = (job, messages) => {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const navy = [10, 31, 68], gold = [201, 168, 76], gray = [107, 114, 128];
  const W = 612, M = 48, CW = W - M * 2;
  let y = 48;

  doc.setFillColor(...navy); doc.rect(0, 0, W, 80, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(201, 168, 76);
  doc.text('AVENSTONE GROUP', M, 34);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gold);
  doc.text('ESTIMATE', M, 50);
  doc.setTextColor(200, 200, 200); doc.setFontSize(9);
  doc.text('avenstonekc.com · Kansas City, MO', W - M, 34, { align: 'right' });
  y = 100;

  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...navy);
  doc.text(job.address || '', M, y); y += 16;
  if (job.client_name) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gray); doc.text(`Client: ${job.client_name}`, M, y); y += 14; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gray);
  doc.text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, M, y); y += 24;

  doc.setDrawColor(...gold); doc.setLineWidth(1.5); doc.line(M, y, W - M, y); y += 20;

  const lastAI = [...messages].reverse().find(m => m.role === 'assistant');
  const text = lastAI?.content || 'No estimate generated yet.';
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(55, 65, 81);
  const lines = doc.splitTextToSize(text, CW);
  lines.forEach(line => { if (y > 730) { doc.addPage(); y = 48; } doc.text(line, M, y); y += 13; });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(...navy); doc.rect(0, 772, W, 40, 'F');
    doc.setFontSize(8); doc.setTextColor(...gold); doc.setFont('helvetica', 'bold');
    doc.text('AVENSTONE GROUP LLC', M, 788);
    doc.setTextColor(180, 180, 180); doc.setFont('helvetica', 'normal');
    doc.text(`Page ${i} of ${pages}`, W / 2, 788, { align: 'center' });
    doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }), W - M, 788, { align: 'right' });
  }
  return doc;
};

// ─── Proposal PDF ─────────────────────────────────────────────────────────────
const LIKELIHOOD_ORDER = { high: 3, medium: 2, low: 1 };

// Reads DB estimate_line_items rows (description, trade, category, total_cost, quantity, unit).
// Applies per-category markup via markupRateForCategory — same math as the Line Items sub-tab.
export const buildProposalPDF = (job, lineItems, ohShitMoments = [], {
  laborPct = 0, materialPct = 0, categoryConfig = null,
  pmFee = 0, proposalNum = '001', schedule = [], flags = [],
} = {}) => {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const navy = [10, 31, 68], gold = [201, 168, 76], gray = [107, 114, 128];
  const W = 612, M = 48, CW = W - M * 2;
  const SAFE_BOTTOM = 728;
  const fmt = n => `$${Math.round(Number(n || 0)).toLocaleString()}`;

  const chkPage = (y, h = 16) => { if (y + h > SAFE_BOTTOM) { doc.addPage(); return M + 8; } return y; };

  const clientPrice = li => {
    const cost = Number(li.total_cost ?? 0);
    const rate = markupRateForCategory(li.category, { laborPct, materialPct, categoryConfig });
    return cost * (1 + rate / 100);
  };

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFillColor(...navy); doc.rect(0, 0, W, 80, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...gold);
  doc.text('AVENSTONE GROUP', M, 34);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gold);
  doc.text('PROPOSAL', M, 50);
  doc.setTextColor(200, 200, 200); doc.setFontSize(9);
  doc.text('avenstonekc.com  ·  Kansas City, MO', W - M, 34, { align: 'right' });
  doc.text(`Proposal #: ${proposalNum}`, W - M, 50, { align: 'right' });

  // ── Job block ───────────────────────────────────────────────────────────────
  let y = 100;
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(...navy);
  doc.text(job.address || '', M, y); y += 18;
  if (job.client_name) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gray);
    doc.text(`Client: ${job.client_name}`, M, y); y += 14;
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gray);
  doc.text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, M, y);
  y += 20;
  doc.setDrawColor(...gold); doc.setLineWidth(1.5); doc.line(M, y, W - M, y); y += 16;

  // ── Flags callout ───────────────────────────────────────────────────────────
  if (flags && flags.length) {
    const flagLines = flags.map(f => doc.splitTextToSize(`⚠  ${f}`, CW - 16));
    const boxH = 14 + flagLines.reduce((s, ls) => s + ls.length * 10, 0) + 8;
    doc.setFillColor(254, 243, 199); doc.setDrawColor(...gold); doc.setLineWidth(1);
    doc.rect(M, y, CW, boxH, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(120, 80, 0);
    doc.text('NOTICE — ESTIMATE ASSUMPTIONS', M + 8, y + 11);
    let fy = y + 22;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80, 50, 0);
    flagLines.forEach(ls => { doc.text(ls, M + 8, fy); fy += ls.length * 10; });
    y += boxH + 12;
  }

  // ── Compute totals ──────────────────────────────────────────────────────────
  const items = lineItems || [];
  const hardCostTotal = items.reduce((s, li) => s + Number(li.total_cost ?? 0), 0);
  const clientSubtotal = items.reduce((s, li) => s + clientPrice(li), 0);
  const markupTotal = clientSubtotal - hardCostTotal;
  const grandTotal = clientSubtotal + Number(pmFee || 0);

  // ── Line items grouped by trade ─────────────────────────────────────────────
  const trades = [];
  const tradeMap = {};
  items.forEach(li => {
    const t = li.trade || 'GENERAL';
    if (!tradeMap[t]) { tradeMap[t] = []; trades.push(t); }
    tradeMap[t].push(li);
  });

  if (trades.length) {
    y = chkPage(y, 28);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy);
    doc.text('SCOPE & PRICING', M, y); y += 14;

    // Table header
    doc.setFillColor(...navy); doc.rect(M, y - 10, CW, 16, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...gold);
    doc.text('DESCRIPTION', M + 4, y);
    doc.text('QTY / UNIT', M + 330, y);
    doc.text('PRICE', W - M, y, { align: 'right' });
    y += 10;

    let rowIdx = 0;
    trades.forEach(trade => {
      const tItems = tradeMap[trade];
      const tradeSub = tItems.reduce((s, li) => s + clientPrice(li), 0);

      // Trade header row
      y = chkPage(y, 20);
      doc.setFillColor(232, 226, 210);
      doc.rect(M, y - 2, CW, 16, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...navy);
      doc.text(trade, M + 4, y + 10);
      y += 16;

      tItems.forEach(li => {
        const price = clientPrice(li);
        const isAllowance = /allowance/i.test(li.description || '');
        const descLines = doc.splitTextToSize(li.description || '', 316);
        const rowH = Math.max(14, descLines.length * 10 + 6) + (isAllowance ? 10 : 0);

        y = chkPage(y, rowH);
        doc.setFillColor(rowIdx % 2 === 0 ? 255 : 250, rowIdx % 2 === 0 ? 255 : 249, rowIdx % 2 === 0 ? 255 : 247);
        doc.rect(M, y - 2, CW, rowH, 'F');

        doc.setFont('helvetica', isAllowance ? 'italic' : 'normal'); doc.setFontSize(8.5); doc.setTextColor(55, 65, 81);
        descLines.forEach((line, idx) => doc.text(line, M + 4, y + 8 + idx * 10));

        const qtyStr = [li.quantity != null ? String(li.quantity) : '', li.unit || ''].filter(Boolean).join(' ');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...gray);
        doc.text(qtyStr, M + 330, y + 8);

        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...navy);
        doc.text(fmt(price), W - M, y + 8, { align: 'right' });

        if (isAllowance) {
          doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(146, 100, 14);
          doc.text('(allowance)', W - M, y + 18, { align: 'right' });
        }

        y += rowH;
        rowIdx++;
      });

      // Trade subtotal
      y = chkPage(y, 16);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...gray);
      doc.text(`${trade} subtotal`, M + 4, y + 8);
      doc.setTextColor(...navy);
      doc.text(fmt(tradeSub), W - M, y + 8, { align: 'right' });
      doc.setDrawColor(220, 215, 200); doc.setLineWidth(0.5); doc.line(M, y + 13, W - M, y + 13);
      y += 18;
    });
    y += 6;
  }

  // ── Summary block ───────────────────────────────────────────────────────────
  y = chkPage(y, 80);
  doc.setDrawColor(...gold); doc.setLineWidth(1.5); doc.line(M, y, W - M, y); y += 14;

  [
    ['Hard Cost Subtotal', fmt(hardCostTotal)],
    ['Markup', fmt(markupTotal)],
    ['PM Fee', fmt(pmFee)],
  ].forEach(([label, val]) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...gray);
    doc.text(label, M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...navy);
    doc.text(val, W - M, y, { align: 'right' });
    y += 15;
  });

  y += 4;
  doc.setFillColor(...navy); doc.rect(M, y - 2, CW, 24, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
  doc.text('GRAND TOTAL', M + 8, y + 16);
  doc.setTextColor(...gold);
  doc.text(fmt(grandTotal), W - M - 4, y + 16, { align: 'right' });
  y += 34;

  // ── Disclosed change-order risks ────────────────────────────────────────────
  const includedMoments = (ohShitMoments || [])
    .filter(m => m.included_in_proposal)
    .sort((a, b) => (LIKELIHOOD_ORDER[b.likelihood] || 0) - (LIKELIHOOD_ORDER[a.likelihood] || 0) || (b.estimated_cost_high || 0) - (a.estimated_cost_high || 0));

  if (includedMoments.length) {
    y = chkPage(y, 60);
    doc.setDrawColor(...gold); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 14;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy);
    doc.text('POSSIBLE CHANGE ORDERS — DISCLOSED UP FRONT', M, y); y += 12;
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...gray);
    const subhead = "Construction sometimes uncovers conditions we can't see until demo begins. We disclose these now so there are no surprises later. If any of these conditions are encountered, a change order will be issued at the disclosed range.";
    const subLines = doc.splitTextToSize(subhead, CW);
    doc.text(subLines, M, y); y += subLines.length * 10 + 8;

    includedMoments.forEach((m, i) => {
      const estH = 36 + (m.how_to_present ? Math.ceil(doc.splitTextToSize(m.how_to_present, CW - 100).length * 10) : 0);
      y = chkPage(y, estH);
      if (i > 0) { doc.setDrawColor(232, 228, 220); doc.setLineWidth(0.5); doc.line(M, y - 4, W - M, y - 4); }

      const likeCfg = { high: [185, 28, 28], low: [21, 128, 61], medium: [146, 64, 14] };
      const likeColor = likeCfg[m.likelihood] || likeCfg.medium;
      const likeLbl = (m.likelihood || 'medium').charAt(0).toUpperCase() + (m.likelihood || 'medium').slice(1);

      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...navy);
      doc.text(m.condition || '', M, y, { maxWidth: CW - 100 });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...likeColor);
      doc.text(`${likeLbl} likelihood`, W - M, y, { align: 'right' });
      y += 12;

      const lo = Number(m.estimated_cost_low || 0), hi = Number(m.estimated_cost_high || 0);
      if (lo || hi) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(55, 65, 81);
        doc.text(`Estimated cost if encountered: $${lo.toLocaleString()} – $${hi.toLocaleString()}`, M, y); y += 11;
      }
      if (m.how_to_present) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...gray);
        const lines = doc.splitTextToSize(m.how_to_present, CW);
        doc.text(lines, M, y); y += lines.length * 10;
      }
      y += 10;
    });
  }

  // ── Payment schedule ────────────────────────────────────────────────────────
  if (schedule.length) {
    y = chkPage(y, 60);
    doc.setDrawColor(...gold); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 14;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy);
    doc.text('PAYMENT SCHEDULE', M, y); y += 14;
    schedule.forEach(ps => {
      y = chkPage(y, 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...navy);
      doc.text(ps.milestone || '', M, y);
      doc.setTextColor(...gray);
      doc.text(ps.timing || '', W / 2, y, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...gold);
      doc.text(fmt(ps.amount), W - M, y, { align: 'right' });
      y += 13;
    });
  }

  // ── Footers ─────────────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(...navy); doc.rect(0, 772, W, 40, 'F');
    doc.setFontSize(8); doc.setTextColor(...gold); doc.setFont('helvetica', 'bold');
    doc.text('AVENSTONE GROUP LLC', M, 788);
    doc.setTextColor(180, 180, 180); doc.setFont('helvetica', 'normal');
    doc.text(`Page ${i} of ${pages}  ·  Valid 30 days from date of issue`, W / 2, 788, { align: 'center' });
    doc.text(now, W - M, 788, { align: 'right' });
  }
  return doc;
};

// ─── Floor Plan PDF ───────────────────────────────────────────────────────────

const _feetInches = (ft) => {
  const totalIn = Math.round((+(ft) || 0) * 12);
  return `${Math.floor(totalIn / 12)}'-${totalIn % 12}"`;
};

const _polyAreaFromSegs = (segs) => {
  if (!segs || segs.length < 3) return 0;
  const rem = segs.map(s => ({ x1: s.x1, z1: s.z1, x2: s.x2, z2: s.z2 }));
  const poly = [];
  let cur = rem.shift();
  poly.push({ x: cur.x1, z: cur.z1 });
  let cx = cur.x2, cz = cur.z2;
  while (rem.length > 0) {
    let bi = -1, bd = Infinity, flip = false;
    for (let i = 0; i < rem.length; i++) {
      const d1 = Math.hypot(rem[i].x1 - cx, rem[i].z1 - cz);
      const d2 = Math.hypot(rem[i].x2 - cx, rem[i].z2 - cz);
      if (d1 < bd) { bd = d1; bi = i; flip = false; }
      if (d2 < bd) { bd = d2; bi = i; flip = true; }
    }
    if (bi === -1 || bd > 2.0) break;
    const n = rem.splice(bi, 1)[0];
    if (flip) { poly.push({ x: n.x2, z: n.z2 }); cx = n.x1; cz = n.z1; }
    else { poly.push({ x: n.x1, z: n.z1 }); cx = n.x2; cz = n.z2; }
  }
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].z - poly[j].x * poly[i].z;
  }
  return Math.abs(area) / 2;
};

const _perimeterFromSegs = (segs) => {
  if (!segs || !segs.length) return 0;
  return segs.reduce((s, seg) => s + Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1), 0);
};

// For multi-room world-space mode — unchanged from original; returns rotated/normalized layout.
const _processAllRooms = (rooms) => {
  const flat = [];
  rooms.forEach((room, ri) => {
    const wx = room.worldX || 0, wz = room.worldZ || 0;
    (room.wallSegments || []).forEach(s =>
      flat.push({ x1: wx+s.x1, z1: wz+s.z1, x2: wx+s.x2, z2: wz+s.z2, ri, t: 'wall' })
    );
    (room.doorSegments || []).forEach(s =>
      flat.push({ x1: wx+s.x1, z1: wz+s.z1, x2: wx+s.x2, z2: wz+s.z2,
                  nx: s.nx||0, nz: s.nz||0, width: s.width||3, ri, t: 'door' })
    );
    (room.windowSegments || []).forEach(s =>
      flat.push({ x1: wx+s.x1, z1: wz+s.z1, x2: wx+s.x2, z2: wz+s.z2, ri, t: 'window' })
    );
    (room.openingSegments || []).forEach(s =>
      flat.push({ x1: wx+s.x1, z1: wz+s.z1, x2: wx+s.x2, z2: wz+s.z2, ri, t: 'opening' })
    );
  });

  const walls = flat.filter(s => s.t === 'wall');
  if (!walls.length) return null;

  const withLen = walls.map(s => ({ ...s, len: Math.hypot(s.x2-s.x1, s.z2-s.z1) }));
  const longest = withLen.reduce((a, b) => b.len > a.len ? b : a);
  let angle = Math.atan2(longest.z2 - longest.z1, longest.x2 - longest.x1);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  const ca = Math.cos(-angle), sa = Math.sin(-angle);
  const rot = (x, z) => [x * ca - z * sa, x * sa + z * ca];

  const rotated = flat.map(s => {
    const [x1, z1] = rot(s.x1, s.z1), [x2, z2] = rot(s.x2, s.z2);
    const out = { ...s, x1, z1, x2, z2 };
    if (s.t === 'door') { out.nx = s.nx * ca - s.nz * sa; out.nz = s.nx * sa + s.nz * ca; }
    return out;
  });

  const wallPts = rotated.filter(s => s.t === 'wall');
  const xs = wallPts.flatMap(s => [s.x1, s.x2]), zs = wallPts.flatMap(s => [s.z1, s.z2]);
  const minX = Math.min(...xs), minZ = Math.min(...zs);
  const maxX = Math.max(...xs), maxZ = Math.max(...zs);
  let tw = maxX - minX || 1, th = maxZ - minZ || 1;

  let normalized = rotated.map(s => ({ ...s, x1: s.x1-minX, z1: s.z1-minZ, x2: s.x2-minX, z2: s.z2-minZ }));
  if (th > tw) {
    normalized = normalized.map(s => {
      const out = { ...s, x1: s.z1, z1: tw-s.x1, x2: s.z2, z2: tw-s.x2 };
      if (s.t === 'door') { out.nx = s.nz; out.nz = -s.nx; }
      return out;
    });
    [tw, th] = [th, tw];
  }

  // Snap near-coincident wall endpoints
  const SNAP_TOL = 0.6;
  const wallNorm = normalized.filter(s => s.t === 'wall');
  const getEP = (s, e) => e === 1 ? [s.x1, s.z1] : [s.x2, s.z2];
  const setEP = (s, e, x, z) => { if (e === 1) { s.x1 = x; s.z1 = z; } else { s.x2 = x; s.z2 = z; } };
  const endpts = wallNorm.flatMap(s => [{ s, e: 1 }, { s, e: 2 }]);
  for (let i = 0; i < endpts.length; i++) {
    for (let j = i + 1; j < endpts.length; j++) {
      if (endpts[i].s === endpts[j].s) continue;
      const [ax, az] = getEP(endpts[i].s, endpts[i].e);
      const [bx, bz] = getEP(endpts[j].s, endpts[j].e);
      if (Math.hypot(ax - bx, az - bz) < SNAP_TOL) {
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        setEP(endpts[i].s, endpts[i].e, mx, mz);
        setEP(endpts[j].s, endpts[j].e, mx, mz);
      }
    }
  }

  const byRoom = (type) => rooms.map((_, ri) =>
    normalized.filter(s => s.ri === ri && s.t === type).map(s => {
      const b = { x1: s.x1, z1: s.z1, x2: s.x2, z2: s.z2 };
      return type === 'door' ? { ...b, nx: s.nx, nz: s.nz, width: s.width, ri: s.ri } : b;
    })
  );

  return { roomSegs: byRoom('wall'), roomDoors: byRoom('door'), roomWindows: byRoom('window'), roomOpenings: byRoom('opening'), trueW: tw, trueH: th };
};

// Returns rotation transform alongside segs so callers can transform other coordinates.
const _processWalls = (wallSegs) => {
  if (!wallSegs || wallSegs.length === 0) return null;
  const withLen = wallSegs.map(s => {
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
    return { ...s, len: Math.sqrt(dx * dx + dz * dz) };
  });
  const longest = withLen.reduce((a, b) => b.len > a.len ? b : a);
  let angle = Math.atan2(longest.z2 - longest.z1, longest.x2 - longest.x1);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  const ca = Math.cos(-angle), sa = Math.sin(-angle);
  const rot = (x, z) => [x * ca - z * sa, x * sa + z * ca];
  const rots = withLen.map(s => {
    const [rx1, rz1] = rot(s.x1, s.z1);
    const [rx2, rz2] = rot(s.x2, s.z2);
    return { x1: rx1, z1: rz1, x2: rx2, z2: rz2, len: s.len };
  });
  const allX = rots.flatMap(s => [s.x1, s.x2]);
  const allZ = rots.flatMap(s => [s.z1, s.z2]);
  const minX = Math.min(...allX), minZ = Math.min(...allZ);
  const maxX = Math.max(...allX), maxZ = Math.max(...allZ);
  let segs = rots.map(s => ({ x1: s.x1 - minX, z1: s.z1 - minZ, x2: s.x2 - minX, z2: s.z2 - minZ, len: s.len }));
  let tw = maxX - minX, th = maxZ - minZ;
  if (tw < 0.5 || th < 0.5) return null;
  if (th > tw) {
    segs = segs.map(s => ({ x1: s.z1, z1: tw - s.x1, x2: s.z2, z2: tw - s.x2, len: s.len }));
    [tw, th] = [th, tw];
  }
  return { segs, trueWidth: tw, trueHeight: th, transform: { angle, minX, minZ } };
};

const _drawArc = (doc, cx, cy, r, startAngle, sweepAngle, steps = 10) => {
  const da = sweepAngle / steps;
  let px = cx + r * Math.cos(startAngle), py = cy + r * Math.sin(startAngle);
  for (let i = 1; i <= steps; i++) {
    const a = startAngle + da * i;
    const nx = cx + r * Math.cos(a), ny = cy + r * Math.sin(a);
    doc.line(px, py, nx, ny); px = nx; py = ny;
  }
};

// ─── Render-time orthogonal snap ─────────────────────────────────────────────
// v1 snap-at-render. Consider moving upstream to Swift/DB once editor features ship.
// See VOICE_AGENT.md + FINANCIALS_PLAN.md pattern for how long-term data shape should live.
const _snapToOrtho = (rooms) => {
  const ANGLE_TOL = 10 * Math.PI / 180; // 10 degrees — aggressively square near-ortho walls
  const MERGE_TOL = 0.5;               // 6 inches in feet
  let snapCount = 0, mergeCount = 0;

  // Deep clone rooms + segments to avoid mutating caller's data
  const cloned = rooms.map(r => ({
    ...r,
    wallSegments:    (r.wallSegments    || []).map(s => ({ ...s })),
    doorSegments:    (r.doorSegments    || []).map(s => ({ ...s })),
    windowSegments:  (r.windowSegments  || []).map(s => ({ ...s })),
    openingSegments: (r.openingSegments || []).map(s => ({ ...s })),
  }));

  // Angle snap pass — walls only
  for (const room of cloned) {
    for (const seg of room.wallSegments) {
      const dx = seg.x2 - seg.x1, dz = seg.z2 - seg.z1;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const angle = Math.atan2(dz, dx);
      const cardinals = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      let best = null, bestDiff = Infinity;
      for (const c of cardinals) {
        let diff = Math.abs(angle - c);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < bestDiff) { bestDiff = diff; best = c; }
      }
      if (bestDiff <= ANGLE_TOL) {
        const mx = (seg.x1 + seg.x2) / 2, mz = (seg.z1 + seg.z2) / 2;
        const half = len / 2;
        seg.x1 = mx - Math.cos(best) * half; seg.z1 = mz - Math.sin(best) * half;
        seg.x2 = mx + Math.cos(best) * half; seg.z2 = mz + Math.sin(best) * half;
        snapCount++;
      }
    }
  }

  // Endpoint merge pass — all wall endpoints across all rooms on this floor
  const endpoints = [];
  for (const room of cloned) {
    for (const seg of room.wallSegments) {
      endpoints.push({ seg, e: 1 });
      endpoints.push({ seg, e: 2 });
    }
  }
  for (let i = 0; i < endpoints.length; i++) {
    const a = endpoints[i];
    const ax = a.e === 1 ? a.seg.x1 : a.seg.x2, az = a.e === 1 ? a.seg.z1 : a.seg.z2;
    for (let j = i + 1; j < endpoints.length; j++) {
      const b = endpoints[j];
      if (a.seg === b.seg) continue;
      const bx = b.e === 1 ? b.seg.x1 : b.seg.x2, bz = b.e === 1 ? b.seg.z1 : b.seg.z2;
      if (Math.hypot(ax - bx, az - bz) < MERGE_TOL) {
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (a.e === 1) { a.seg.x1 = mx; a.seg.z1 = mz; } else { a.seg.x2 = mx; a.seg.z2 = mz; }
        if (b.e === 1) { b.seg.x1 = mx; b.seg.z1 = mz; } else { b.seg.x2 = mx; b.seg.z2 = mz; }
        mergeCount++;
      }
    }
  }

  console.log(`[LIDAR_DEBUG] snapped ${snapCount} walls to axis, merged ${mergeCount} endpoints`);
  return cloned;
};

// ─── Floor grouping ───────────────────────────────────────────────────────────
// No `floor` field in current Swift output — all rooms land on floor 0.
// When Swift adds a `floor` integer, this grouping will work automatically.
const _groupByFloor = (rooms) => {
  const map = new Map();
  rooms.forEach(r => {
    const f = (r.floor !== undefined && r.floor !== null) ? r.floor : 0;
    if (!map.has(f)) map.set(f, []);
    map.get(f).push(r);
  });
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([fi, rms]) => ({ floorIndex: fi, floorName: _floorLabel(fi), rooms: rms }));
};

// ─── Dedup shared doors/windows/openings ─────────────────────────────────────
// Works in rotated/normalized world-space (feet) returned by _processAllRooms.
const _dedupFeatures = (allDoors, allWindows, allOpenings, floorIndex) => {
  const midpt = f => [(f.x1 + f.x2) / 2, (f.z1 + f.z2) / 2];
  const segLen = f => Math.hypot(f.x2 - f.x1, f.z2 - f.z1);

  const isDupDoor = (a, b) => {
    const [amx, amz] = midpt(a), [bmx, bmz] = midpt(b);
    if (Math.hypot(amx - bmx, amz - bmz) > 0.5) return false;
    const aw = segLen(a), bw = segLen(b);
    if (Math.abs(aw - bw) / Math.max(aw, bw, 0.01) > 0.1) return false;
    return Math.abs(a.nx * b.nx + a.nz * b.nz) >= 0.9;
  };
  const isDupFeat = (a, b) => {
    const [amx, amz] = midpt(a), [bmx, bmz] = midpt(b);
    if (Math.hypot(amx - bmx, amz - bmz) > 0.5) return false;
    const aw = segLen(a), bw = segLen(b);
    return Math.abs(aw - bw) / Math.max(aw, bw, 0.01) <= 0.1;
  };

  const dedup = (arr, fn) => {
    const kept = [];
    arr.forEach(f => { if (!kept.some(k => fn(k, f))) kept.push(f); });
    return kept;
  };

  const doors = dedup(allDoors, isDupDoor);
  const windows = dedup(allWindows, isDupFeat);
  const openings = dedup(allOpenings, isDupFeat);
  const removed = (allDoors.length - doors.length) + (allWindows.length - windows.length) + (allOpenings.length - openings.length);
  console.log(`[LIDAR_DEBUG] deduped ${removed} shared features on floor ${floorIndex}`);
  return { doors, windows, openings };
};

// ─── Geometry helpers ─────────────────────────────────────────────────────────
const _segsToPolyPoints = (segs, storedSqftEst) => {
  if (!segs || segs.length < 3) return (segs || []).map(s => ({ x: s.x1, z: s.z1 }));
  const rem = segs.map(s => ({ x1: s.x1, z1: s.z1, x2: s.x2, z2: s.z2 }));
  const poly = [];
  let cur = rem.shift();
  poly.push({ x: cur.x1, z: cur.z1 });
  let cx = cur.x2, cz = cur.z2;
  while (rem.length) {
    let bi = -1, bd = Infinity, flip = false;
    for (let i = 0; i < rem.length; i++) {
      const d1 = Math.hypot(rem[i].x1 - cx, rem[i].z1 - cz);
      const d2 = Math.hypot(rem[i].x2 - cx, rem[i].z2 - cz);
      if (d1 < bd) { bd = d1; bi = i; flip = false; }
      if (d2 < bd) { bd = d2; bi = i; flip = true; }
    }
    if (bi === -1 || bd > 2.0) {
      if (bi === -1 || rem.length === 0) break;
      // Bridge gap: no segment within 2.0 ft threshold, but unconsumed segments remain — jump to nearest anyway.
      const n = rem.splice(bi, 1)[0];
      if (flip) { poly.push({ x: n.x2, z: n.z2 }); cx = n.x1; cz = n.z1; }
      else { poly.push({ x: n.x1, z: n.z1 }); cx = n.x2; cz = n.z2; }
      continue;
    }
    const n = rem.splice(bi, 1)[0];
    if (flip) { poly.push({ x: n.x2, z: n.z2 }); cx = n.x1; cz = n.z1; }
    else { poly.push({ x: n.x1, z: n.z1 }); cx = n.x2; cz = n.z2; }
  }
  // Close the ring back to the first vertex once all segments are consumed.
  if (poly.length >= 2) poly.push({ x: poly[0].x, z: poly[0].z });

  // Degenerate guard: if <4 vertices or shoelace area < 50% of stored sqft estimate, fall back to bounding-box rectangle.
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].z - poly[j].x * poly[i].z;
  }
  area = Math.abs(area) / 2;
  const tooFewVerts = poly.length < 4;
  const tooSmall = storedSqftEst > 0 && area < storedSqftEst * 0.5;
  if (tooFewVerts || tooSmall) {
    // Fallback: axis-aligned bounding box of all wall-segment endpoints.
    const xs = segs.flatMap(s => [s.x1, s.x2]), zs = segs.flatMap(s => [s.z1, s.z2]);
    const mnX = Math.min(...xs), mxX = Math.max(...xs), mnZ = Math.min(...zs), mxZ = Math.max(...zs);
    console.log(`[LIDAR_PDF_FALLBACK] degenerate poly (verts=${poly.length - 1}, area=${area.toFixed(1)}, stored=${storedSqftEst || '?'}) → bbox`);
    return [{ x: mnX, z: mnZ }, { x: mxX, z: mnZ }, { x: mxX, z: mxZ }, { x: mnX, z: mxZ }, { x: mnX, z: mnZ }];
  }
  return poly;
};

// Segment-adjacency ring walk — replaces angle-sort for concave rooms.
// Operates on already-processed segs (render coordinate space, {x1,z1,x2,z2}).
// Pre-snaps to 0.1 ft grid; exact endpoint match wins, falls back to nearest.
// Returns [{x, z}, ...] in walk order — same format as _segsToPolyPoints.
const _walkRingFromSegs = (segs) => {
  if (!segs || segs.length === 0) return [];
  const SNAP = 0.1, EPS2 = 0.0025; // 0.05 ft squared
  const n = segs.length;
  const s = segs.map(seg => ({
    x1: Math.round(seg.x1 / SNAP) * SNAP,
    z1: Math.round(seg.z1 / SNAP) * SNAP,
    x2: Math.round(seg.x2 / SNAP) * SNAP,
    z2: Math.round(seg.z2 / SNAP) * SNAP,
  }));
  const used = new Array(n).fill(false);
  used[0] = true;
  const poly = [{ x: s[0].x1, z: s[0].z1 }];
  let cx = s[0].x2, cz = s[0].z2;
  let count = 1;
  while (count < n) {
    const dx0 = cx - poly[0].x, dz0 = cz - poly[0].z;
    if (dx0 * dx0 + dz0 * dz0 < EPS2) break; // closed
    let bestJ = -1, bestDist = Infinity, bestFlip = false;
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      const d1 = (s[j].x1 - cx) ** 2 + (s[j].z1 - cz) ** 2;
      const d2 = (s[j].x2 - cx) ** 2 + (s[j].z2 - cz) ** 2;
      if (d1 < EPS2) { bestJ = j; bestFlip = false; break; } // exact match
      if (d2 < EPS2) { bestJ = j; bestFlip = true; break; }  // exact match
      if (d1 < bestDist) { bestDist = d1; bestJ = j; bestFlip = false; }
      if (d2 < bestDist) { bestDist = d2; bestJ = j; bestFlip = true; }
    }
    if (bestJ < 0) break;
    used[bestJ] = true;
    count++;
    if (bestFlip) {
      poly.push({ x: s[bestJ].x2, z: s[bestJ].z2 });
      cx = s[bestJ].x1; cz = s[bestJ].z1;
    } else {
      poly.push({ x: s[bestJ].x1, z: s[bestJ].z1 });
      cx = s[bestJ].x2; cz = s[bestJ].z2;
    }
  }
  return poly;
};

const _polyCentroid = (poly) => {
  if (!poly.length) return { x: 0, z: 0 };
  let A = 0, cx = 0, cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const cross = poly[i].x * poly[j].z - poly[j].x * poly[i].z;
    A += cross; cx += (poly[i].x + poly[j].x) * cross; cz += (poly[i].z + poly[j].z) * cross;
  }
  A /= 2;
  if (Math.abs(A) < 0.001) return { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, z: poly.reduce((s, p) => s + p.z, 0) / poly.length };
  return { x: cx / (6 * A), z: cz / (6 * A) };
};

const _pointInPoly = (px, pz, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
    if (((zi > pz) !== (zj > pz)) && px < ((xj - xi) * (pz - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
};

// Grid-search for interior point with max clearance (polylabel approximation).
const _interiorPoint = (poly, segs) => {
  if (!poly.length) return { x: 0, z: 0 };
  const xs = poly.map(p => p.x), zs = poly.map(p => p.z);
  const mnX = Math.min(...xs), mxX = Math.max(...xs), mnZ = Math.min(...zs), mxZ = Math.max(...zs);
  const step = Math.max((mxX - mnX) / 12, (mxZ - mnZ) / 12, 0.3);
  let best = null, bestD = -1;
  for (let gx = mnX + step / 2; gx < mxX; gx += step) {
    for (let gz = mnZ + step / 2; gz < mxZ; gz += step) {
      if (!_pointInPoly(gx, gz, poly)) continue;
      const d = segs.reduce((md, s) => {
        const dx = s.x2 - s.x1, dz = s.z2 - s.z1, len2 = dx * dx + dz * dz;
        if (len2 < 0.0001) return Math.min(md, Math.hypot(gx - s.x1, gz - s.z1));
        const t = Math.max(0, Math.min(1, ((gx - s.x1) * dx + (gz - s.z1) * dz) / len2));
        return Math.min(md, Math.hypot(gx - s.x1 - t * dx, gz - s.z1 - t * dz));
      }, Infinity);
      if (d > bestD) { bestD = d; best = { x: gx, z: gz }; }
    }
  }
  return best || { x: (mnX + mxX) / 2, z: (mnZ + mxZ) / 2 };
};

// ─── Chain dimension renderer ─────────────────────────────────────────────────
// Renders MagicPlan-style chain dims for one edge.
// segs: exterior segments on this edge (plan-space feet)
// dimLinePt: page-space coordinate of the chain dim line (x if !isHoriz, y if isHoriz)
// overallPt: page-space coordinate of the outer overall dim line
// normalSign: +1 or -1 (page-space direction labels are pushed toward)
// isHoriz: true → top/bottom edge (chain runs horizontally, segs sorted by x)
// oX, oY, scale: plan origin and scale factor
const _renderChainDims = (doc, segs, dimLinePt, overallPt, normalSign, isHoriz, oX, oY, scale) => {
  if (!segs.length) return [];
  const labelBoxes = [];

  // Dedup: drop segs whose range overlaps ≥80% with an already-kept seg (handles wall-thickness twins)
  const startOf = s => isHoriz ? Math.min(s.x1, s.x2) : Math.min(s.z1, s.z2);
  const endOf   = s => isHoriz ? Math.max(s.x1, s.x2) : Math.max(s.z1, s.z2);
  const sorted = [...segs].sort((a, b) => {
    const sa = startOf(a), sb = startOf(b);
    if (sa !== sb) return sa - sb;
    return (endOf(b) - sb) - (endOf(a) - sa); // longer first on tie
  });
  const kept = [];
  for (const seg of sorted) {
    const s1 = startOf(seg), e1 = endOf(seg);
    const dupOrContained = kept.some(d => {
      const s2 = startOf(d), e2 = endOf(d);
      const overlap = Math.max(0, Math.min(e1, e2) - Math.max(s1, s2));
      const shorter = Math.min(e1 - s1, e2 - s2);
      return shorter > 0 && overlap / shorter >= 0.8;
    });
    if (!dupOrContained) kept.push(seg);
  }
  if (segs.length !== kept.length) console.log(`[LIDAR_PDF_DEDUP] ${isHoriz ? 'horiz' : 'vert'} chain: ${segs.length} → ${kept.length} segs`);
  if (!kept.length) return [];

  // Sort along the chain direction
  kept.sort((a, b) => isHoriz
    ? Math.min(a.x1, a.x2) - Math.min(b.x1, b.x2)
    : Math.min(a.z1, a.z2) - Math.min(b.z1, b.z2));

  // Unique tick positions in feet → page coords
  const tickSet = new Set();
  for (const seg of kept) {
    tickSet.add(isHoriz ? Math.min(seg.x1, seg.x2) : Math.min(seg.z1, seg.z2));
    tickSet.add(isHoriz ? Math.max(seg.x1, seg.x2) : Math.max(seg.z1, seg.z2));
  }
  const ticks = [...tickSet].sort((a, b) => a - b);
  const ticksPage = ticks.map(t => (isHoriz ? oX : oY) + t * scale);
  const chainStartPg = ticksPage[0], chainEndPg = ticksPage[ticksPage.length - 1];
  const chainLenFt = ticks[ticks.length - 1] - ticks[0];

  if (!isHoriz) {
    console.log('[LIDAR_PDF_RIGHT_EDGE]', { ticks, segLengths: kept.map(s => s.len) });
  }

  // Extension lines from wall face to overall dim line
  doc.setDrawColor(100, 100, 100); doc.setLineWidth(0.5);
  for (const tp of ticksPage) {
    // Wall face is at the bounding box edge — the perpendicular coord of the wall itself
    // We run extension lines from just outside the wall to the overall dim line
    const wallFacePg = dimLinePt - normalSign * 20; // wall face = chain dim line minus offset
    if (isHoriz) doc.line(tp, wallFacePg + normalSign * 5, tp, overallPt);
    else         doc.line(wallFacePg + normalSign * 5, tp, overallPt, tp);
  }

  // Chain dim line
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.75);
  if (isHoriz) doc.line(chainStartPg, dimLinePt, chainEndPg, dimLinePt);
  else         doc.line(dimLinePt, chainStartPg, dimLinePt, chainEndPg);

  // Tick marks at each boundary (45° slash)
  const T = 4;
  for (const tp of ticksPage) {
    if (isHoriz) doc.line(tp - T, dimLinePt - T, tp + T, dimLinePt + T);
    else         doc.line(dimLinePt - T, tp - T, dimLinePt + T, tp + T);
  }

  // Helper: render a dim label and track its bounding box
  const _drawDimLabel = (lx, ly, label) => {
    const tw = label.length * 3.8;
    const rx = lx - tw / 2 - 1, ry = ly - 4, rw = tw + 2, rh = 7;
    doc.setFillColor(255, 255, 255);
    doc.rect(rx, ry, rw, rh, 'F');
    doc.setTextColor(0, 0, 0);
    doc.text(label, lx, ly, { align: 'center', baseline: 'middle' });
    labelBoxes.push({ x: rx, y: ry, w: rw, h: rh });
  };

  // Segment labels — greedy tier assignment to prevent overlap
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  const placedByTier = []; // placedByTier[tier] = [{midPg, halfW}]
  const segRenders = [];

  for (const seg of kept) {
    const s = isHoriz ? Math.min(seg.x1, seg.x2) : Math.min(seg.z1, seg.z2);
    const e = isHoriz ? Math.max(seg.x1, seg.x2) : Math.max(seg.z1, seg.z2);
    const midFt = (s + e) / 2;
    const midPg = (isHoriz ? oX : oY) + midFt * scale;
    const label = _feetInches(seg.len);
    // Primary-axis half-extent of the label box
    const halfW = isHoriz ? (label.length * 3.8 / 2 + 1) : 3.5;

    let tier = 0;
    while (true) {
      const placed = placedByTier[tier] || [];
      const overlaps = placed.some(p => midPg - halfW < p.midPg + p.halfW && p.midPg - p.halfW < midPg + halfW);
      if (!overlaps) break;
      tier++;
    }
    if (!placedByTier[tier]) placedByTier[tier] = [];
    placedByTier[tier].push({ midPg, halfW });
    segRenders.push({ midPg, label, tier });
  }

  for (const { midPg, label, tier } of segRenders) {
    const tierOff = 8 + tier * 8;
    const lx = isHoriz ? midPg : dimLinePt + normalSign * tierOff;
    const ly = isHoriz ? dimLinePt + normalSign * tierOff : midPg;

    if (tier > 0) {
      // Extension stub from the chain dim line out to the tiered label position
      doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.4);
      if (isHoriz) doc.line(midPg, dimLinePt + normalSign * 8, midPg, dimLinePt + normalSign * tierOff);
      else         doc.line(dimLinePt + normalSign * 8, midPg, dimLinePt + normalSign * tierOff, midPg);
      doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.75);
    }

    _drawDimLabel(lx, ly, label);
  }

  // Overall dim line (heavier, outer tier) — only drawn when chain has multiple segments
  if (kept.length > 1) {
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(1.0);
    if (isHoriz) doc.line(chainStartPg, overallPt, chainEndPg, overallPt);
    else         doc.line(overallPt, chainStartPg, overallPt, chainEndPg);
    // Overall ticks
    if (isHoriz) {
      doc.line(chainStartPg - T, overallPt - T, chainStartPg + T, overallPt + T);
      doc.line(chainEndPg   - T, overallPt - T, chainEndPg   + T, overallPt + T);
    } else {
      doc.line(overallPt - T, chainStartPg - T, overallPt + T, chainStartPg + T);
      doc.line(overallPt - T, chainEndPg   - T, overallPt + T, chainEndPg   + T);
    }
    // Overall label
    const midPg = (chainStartPg + chainEndPg) / 2;
    const lx = isHoriz ? midPg : overallPt + normalSign * 8;
    const ly = isHoriz ? overallPt + normalSign * 8 : midPg;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    _drawDimLabel(lx, ly, _feetInches(chainLenFt));
  } else if (kept.length === 1) {
    // Single segment: just label the chain dim line (no separate overall)
    const midPg = (chainStartPg + chainEndPg) / 2;
    const lx = isHoriz ? midPg : dimLinePt + normalSign * 8;
    const ly = isHoriz ? dimLinePt + normalSign * 8 : midPg;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    _drawDimLabel(lx, ly, _feetInches(chainLenFt));
  }

  return labelBoxes;
};

// ─── Draw helpers ─────────────────────────────────────────────────────────────

// Filled poché rectangle for a wall segment (true double-line effect with black fill).
const _drawPoché = (doc, x1, y1, x2, y2, thick) => {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 0.5) return;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const px = -uy * thick / 2, py = ux * thick / 2;
  // Extend each end by thick/2 so adjacent perpendicular rectangles overlap at corners,
  // filling the gap that would otherwise appear at every wall junction.
  const ext = thick / 2;
  const c = [
    [x1 - ux * ext + px, y1 - uy * ext + py],
    [x2 + ux * ext + px, y2 + uy * ext + py],
    [x2 + ux * ext - px, y2 + uy * ext - py],
    [x1 - ux * ext - px, y1 - uy * ext - py],
  ];
  doc.setFillColor(0, 0, 0);
  doc.lines([[c[1][0]-c[0][0], c[1][1]-c[0][1]], [c[2][0]-c[1][0], c[2][1]-c[1][1]], [c[3][0]-c[2][0], c[3][1]-c[2][1]]], c[0][0], c[0][1], [1, 1], 'F', true);
};

// Erase (white) rectangle at a door/window/opening gap.
const _eraseGap = (doc, p1x, p1y, p2x, p2y, wallThick, fillRgb = [255, 255, 255]) => {
  const dw = Math.hypot(p2x - p1x, p2y - p1y);
  if (dw < 1) return;
  const ux = (p2x - p1x) / dw, uy = (p2y - p1y) / dw;
  const px = -uy, py = ux;
  const T = wallThick / 2 + 2;
  const hw = dw / 2 * 1.05;
  const mx = (p1x + p2x) / 2, my = (p1y + p2y) / 2;
  const c = [
    [mx + ux * hw + px * T, my + uy * hw + py * T],
    [mx - ux * hw + px * T, my - uy * hw + py * T],
    [mx - ux * hw - px * T, my - uy * hw - py * T],
    [mx + ux * hw - px * T, my + uy * hw - py * T],
  ];
  doc.setFillColor(...fillRgb);
  doc.lines([[c[1][0]-c[0][0], c[1][1]-c[0][1]], [c[2][0]-c[1][0], c[2][1]-c[1][1]], [c[3][0]-c[2][0], c[3][1]-c[2][1]]], c[0][0], c[0][1], [1, 1], 'F', true);
};

// Architectural dimension line. (p1,p2) = wall endpoints in page coords. (nx,ny) = outward unit normal.
const _dimLine = (doc, p1x, p1y, p2x, p2y, nx, ny, label, { off = 44, lw = 0.75 } = {}) => {
  const ex1 = p1x + nx * off, ey1 = p1y + ny * off;
  const ex2 = p2x + nx * off, ey2 = p2y + ny * off;
  // Extension lines (thin gray)
  doc.setDrawColor(100, 100, 100); doc.setLineWidth(0.5);
  doc.line(p1x + nx * 6, p1y + ny * 6, ex1, ey1);
  doc.line(p2x + nx * 6, p2y + ny * 6, ex2, ey2);
  // Dim line (black)
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(lw);
  doc.line(ex1, ey1, ex2, ey2);
  // Tick marks — architectural 45° diagonal slashes
  const dl = Math.hypot(ex2 - ex1, ey2 - ey1) || 1;
  const tx = (ex2 - ex1) / dl, ty = (ey2 - ey1) / dl;
  const T = 5;
  doc.line(ex1 - tx * T + (-ty) * T, ey1 - ty * T + tx * T, ex1 + tx * T - (-ty) * T, ey1 + ty * T - tx * T);
  doc.line(ex2 - tx * T + (-ty) * T, ey2 - ty * T + tx * T, ex2 + tx * T - (-ty) * T, ey2 + ty * T - tx * T);
  // Label with white background
  const midX = (ex1 + ex2) / 2 + nx * 8, midY = (ey1 + ey2) / 2 + ny * 8;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  const tw = label.length * 3.8;
  doc.setFillColor(255, 255, 255);
  doc.rect(midX - tw / 2 - 1, midY - 4, tw + 2, 7, 'F');
  doc.setTextColor(0, 0, 0);
  doc.text(label, midX, midY, { align: 'center', baseline: 'middle' });
};

// Graduated scale bar — 5 segments of 2ft each = 10ft total.
const _drawScaleBar = (doc, x, y, scale) => {
  const segFt = 2, segs = 5, segPx = segFt * scale, totalPx = segs * segPx;
  doc.setLineWidth(0.5);
  for (let i = 0; i < segs; i++) {
    const sx = x + i * segPx;
    if (i % 2 === 0) { doc.setFillColor(0, 0, 0); doc.rect(sx, y, segPx, 5, 'F'); }
    else { doc.setFillColor(255, 255, 255); doc.rect(sx, y, segPx, 5, 'F'); }
  }
  doc.setDrawColor(0, 0, 0); doc.rect(x, y, totalPx, 5, 'S');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(40, 40, 40);
  for (let i = 0; i <= segs; i++) {
    doc.text(`${i * segFt}`, x + i * segPx, y - 2, { align: 'center' });
  }
  doc.text('ft', x + totalPx + 3, y - 2);
  doc.setFontSize(5.5); doc.setTextColor(100, 100, 100);
  doc.text(`1" = ${(72 / scale).toFixed(1)} ft`, x, y + 12);
};

// Left-side vertical title column.
const _drawTitleColumn = (doc, H, job, floorName, floorNum, totalFloors, pageNum, totalPages, logoDataUrl) => {
  const navy = [10, 31, 68], gold = [201, 168, 76], gray = [100, 100, 100];
  const TC_W = 108, M = 30;
  // Navy background strip
  doc.setFillColor(...navy); doc.rect(0, 0, TC_W, H, 'F');
  // Gold accent line on right edge
  doc.setDrawColor(...gold); doc.setLineWidth(1.5); doc.line(TC_W, 0, TC_W, H);
  // Logo or fallback text
  const logoSize = 88;
  const logoX = (TC_W - logoSize) / 2;
  const logoY = 12;
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'JPEG', logoX, logoY, logoSize, logoSize);
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...gold);
    doc.text('AVENSTONE', TC_W / 2, logoY + 30, { align: 'center' });
    doc.text('GROUP', TC_W / 2, logoY + 42, { align: 'center' });
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(180, 180, 180);
  doc.text('FLOOR PLAN', TC_W / 2, logoY + logoSize + 8, { align: 'center' });
  doc.setDrawColor(...gold); doc.setLineWidth(0.5); doc.line(M, logoY + logoSize + 14, TC_W - M, logoY + logoSize + 14);
  // Address
  const date = job.captured_at
    ? new Date(job.captured_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(255, 255, 255);
  const addrLines = doc.splitTextToSize(job.address || 'Property Address', TC_W - M * 2);
  let ty = logoY + logoSize + 24;
  addrLines.slice(0, 3).forEach(ln => { doc.text(ln, TC_W / 2, ty, { align: 'center' }); ty += 9; });
  if (job.client_name) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(200, 200, 200);
    doc.text(job.client_name, TC_W / 2, ty + 2, { align: 'center' }); ty += 11;
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(160, 160, 160);
  doc.text(date, TC_W / 2, ty + 2, { align: 'center' }); ty += 10;
  doc.setDrawColor(...gold); doc.setLineWidth(0.4); doc.line(M, ty, TC_W - M, ty); ty += 10;
  // Floor label
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...gold);
  const floorLabel = totalFloors > 1 ? `${floorName.toUpperCase()}` : floorName.toUpperCase();
  const floorSub = totalFloors > 1 ? `${floorNum} OF ${totalFloors}` : '';
  doc.text(floorLabel, TC_W / 2, ty, { align: 'center' }); ty += 9;
  if (floorSub) { doc.setFontSize(6); doc.setTextColor(160, 160, 160); doc.text(floorSub, TC_W / 2, ty, { align: 'center' }); ty += 9; }
  // Page number at bottom
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(140, 140, 140);
  doc.text(`pg ${pageNum}/${totalPages}`, TC_W / 2, H - M, { align: 'center' });
};

// ─── Floor page renderer ──────────────────────────────────────────────────────
const _renderFloorPage = (doc, floor, job, floorNum, totalFloors, pageNum, totalPages, W, H, logoDataUrl, layout_hints = {}, hints_by_name = {}, wallClassByRoomAndSeg = {}, normFloor = null) => {
  const navy = [10, 31, 68];

  _drawTitleColumn(doc, H, job, floor.floorName, floorNum, totalFloors, pageNum, totalPages, logoDataUrl);

  // Drawing bounds: left column (TC_W=108) + dim bands (60pt each side)
  const DL = 168, DR = 704, DT = 82, DB = 558;
  const availW = DR - DL, availH = DB - DT;

  const worldMode = floor.rooms.some(r => r.worldX !== undefined && r.worldX !== null);
  const drawableRooms = worldMode ? floor.rooms.filter(r => (r.wallSegments || []).length >= 3) : floor.rooms;

  if (!drawableRooms.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(150, 150, 150);
    doc.text('No scan data available for this floor.', W / 2, (DT + DB) / 2, { align: 'center' });
    return;
  }

  let scale = 1, oX = DL, oY = DT;
  let allWallSegs = [], allDoors = [], allWindows = [], allOpenings = [];
  let roomLayouts = []; // [{room, segs, x, y, w, h}]
  let dimBoxes = [];

  if (worldMode) {
    let snappedRooms;
    if (normFloor) {
      // Normalized path: walls are already world-space + ortho-snapped — skip _snapToOrtho.
      // Reconstruct rooms with worldX/worldZ=0 so _processAllRooms handles rotation+origin only.
      console.log(`[LIDAR_PDF_STAGE] normalized path (${normFloor.rooms.length} rooms)`);
      snappedRooms = normFloor.rooms
        .filter(r => normFloor.walls.some(w => w.room_id === r.id))
        .map(r => ({
          ...r,
          sqft: Math.round(r.area_sqft),
          worldX: 0, worldZ: 0,
          wallSegments: normFloor.walls
            .filter(w => w.room_id === r.id)
            .map(w => ({ x1: w.p1[0], z1: w.p1[1], x2: w.p2[0], z2: w.p2[1] })),
          doorSegments: normFloor.doors
            .filter(d => d.room_ids?.includes(r.id))
            .map(d => ({ x1: d.p1[0], z1: d.p1[1], x2: d.p2[0], z2: d.p2[1], nx: d.nx || 0, nz: d.nz || 0, width: d.width || 3 })),
          windowSegments: normFloor.windows
            .filter(w => w.room_id === r.id)
            .map(w => ({ x1: w.p1[0], z1: w.p1[1], x2: w.p2[0], z2: w.p2[1] })),
        }));
    } else {
      console.log(`[LIDAR_PDF_STAGE] snapping to ortho (${drawableRooms.length} rooms)`);
      snappedRooms = _snapToOrtho(drawableRooms);
    }
    console.log('[LIDAR_PDF_STAGE] processing all rooms');
    const processed = _processAllRooms(snappedRooms);
    if (!processed) return;
    const { roomSegs, roomDoors, roomWindows, roomOpenings, trueW, trueH } = processed;

    scale = Math.min(availW / trueW, availH / trueH);
    const drawW = trueW * scale, drawH = trueH * scale;
    oX = DL + (availW - drawW) / 2;
    oY = DT + (availH - drawH) / 2;

    // Flatten all features for dedup
    const flatDoors = roomDoors.flat(), flatWins = roomWindows.flat(), flatOps = roomOpenings.flat();
    const deduped = _dedupFeatures(flatDoors, flatWins, flatOps, floor.floorIndex);
    allDoors = deduped.doors; allWindows = deduped.windows; allOpenings = deduped.openings;

    // Wall classification: prefer Phase 1 classified walls (wallClassByRoomAndSeg lookup).
    // Falls back to pairwise midpoint/length/direction heuristic when lookup unavailable.
    const hasClassification = Object.keys(wallClassByRoomAndSeg).length > 0;
    const isInteriorWall = (room, si, seg) => {
      if (hasClassification) {
        const roomClasses = wallClassByRoomAndSeg[room.id];
        if (roomClasses && si < roomClasses.length) return roomClasses[si] === 'interior';
      }
      return !!seg._interior;
    };
    if (!hasClassification) {
      const flatWalls = [];
      roomSegs.forEach((segs, ri) => segs.forEach(seg => {
        const len = Math.hypot(seg.x2-seg.x1, seg.z2-seg.z1);
        flatWalls.push({ seg, ri, mx: (seg.x1+seg.x2)/2, mz: (seg.z1+seg.z2)/2, len,
          ux: len > 0.01 ? (seg.x2-seg.x1)/len : 0, uz: len > 0.01 ? (seg.z2-seg.z1)/len : 0 });
      }));
      for (let i = 0; i < flatWalls.length; i++) {
        for (let j = i+1; j < flatWalls.length; j++) {
          const a = flatWalls[i], b = flatWalls[j];
          if (a.ri === b.ri) continue;
          if (Math.hypot(a.mx-b.mx, a.mz-b.mz) > 0.5) continue;
          if (Math.abs(a.len-b.len) / Math.max(a.len, b.len, 0.01) > 0.15) continue;
          if (Math.abs(a.ux*b.ux + a.uz*b.uz) < 0.9) continue;
          a.seg._interior = true; b.seg._interior = true;
        }
      }
    }
    const extCnt = roomSegs.reduce((c, segs, ri) => c + segs.filter((s, si) => !isInteriorWall(snappedRooms[ri], si, s)).length, 0);
    const intCnt = roomSegs.reduce((c, segs, ri) => c + segs.filter((s, si) => isInteriorWall(snappedRooms[ri], si, s)).length, 0);
    console.log(`[LIDAR_DEBUG] walls: ${extCnt} exterior, ${intCnt} interior (${hasClassification ? 'classified' : 'pairwise-fallback'})`);

    // Collect all wall segs for dim labels
    snappedRooms.forEach((room, ri) => {
      const segs = roomSegs[ri] || [];
      segs.forEach((s, si) => allWallSegs.push({ ...s, interior: isInteriorWall(room, si, s) }));
    });

    // Build room layouts for label positioning
    roomLayouts = snappedRooms.map((room, ri) => {
      const segs = roomSegs[ri] || [];
      if (!segs.length) return null;
      const rxs = segs.flatMap(s => [s.x1, s.x2]), rzs = segs.flatMap(s => [s.z1, s.z2]);
      return { room, segs, x: oX + Math.min(...rxs) * scale, y: oY + Math.min(...rzs) * scale, w: (Math.max(...rxs) - Math.min(...rxs)) * scale, h: (Math.max(...rzs) - Math.min(...rzs)) * scale };
    }).filter(Boolean);

    // ── Floor fill — unified footprint ───────────────────────────────────────
    // Union all room rings into one continuous surface so doorway thresholds
    // are covered and per-room fill transitions don't produce diagonal artifacts.
    {
      const polys = [];
      for (const { segs } of roomLayouts) {
        if (segs.length < 3) continue;
        const ring = _walkRingFromSegs(segs);
        if (ring.length < 3) continue;
        polys.push([ring.map(p => [p.x, p.z])]);
      }
      doc.setFillColor(...FLOOR_TINT);
      let unionResult = null;
      try {
        if (polys.length > 0) unionResult = polygonClipping.union(...polys);
      } catch (e) {
        console.warn('[LIDAR_PDF] polygon union failed, falling back to per-room fill:', e.message);
      }
      if (unionResult) {
        for (const poly of unionResult) {
          let ring = poly[0]; // outer ring (ignore holes)
          if (ring.length > 1) {
            const f = ring[0], l = ring[ring.length - 1];
            if (f[0] === l[0] && f[1] === l[1]) ring = ring.slice(0, -1);
          }
          if (ring.length < 3) continue;
          const pts = ring.map(([x, z]) => [oX + x * scale, oY + z * scale]);
          doc.lines(pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], 'F', true);
        }
      } else {
        // fallback: fill per room (original behaviour)
        for (const { segs } of roomLayouts) {
          if (segs.length < 3) continue;
          const ring = _walkRingFromSegs(segs);
          if (ring.length < 3) continue;
          const pts = ring.map(p => [oX + p.x * scale, oY + p.z * scale]);
          doc.lines(pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], 'F', true);
        }
      }
    }

    // ── Draw walls (poché) ────────────────────────────────────────────────────
    for (const { room, segs } of roomLayouts) {
      segs.forEach((seg, si) => {
        const thick = 6; // uniform 2x4 wall width (~3.5" at plan scale)
        _drawPoché(doc, oX + seg.x1 * scale, oY + seg.z1 * scale, oX + seg.x2 * scale, oY + seg.z2 * scale, thick);
      });
    }

    // ── Erase openings, draw door/window symbols ──────────────────────────────
    // Determine wall thickness at each feature — use 6 for exterior, 3 for interior
    // (features sit on shared walls so typically 3; err toward 6 for visual clarity)
    const FEAT_WALL_T = 7;

    for (const door of allDoors) {
      const p1x = oX + door.x1 * scale, p1y = oY + door.z1 * scale;
      const p2x = oX + door.x2 * scale, p2y = oY + door.z2 * scale;
      const dw = Math.hypot(p2x - p1x, p2y - p1y);
      if (dw < 4) continue;
      _eraseGap(doc, p1x, p1y, p2x, p2y, FEAT_WALL_T, FLOOR_TINT);
      // Door symbol: garage/overhead (≥6ft in garage room), bi-fold (4–6ft), or swing arc (<4ft)
      const roomName = snappedRooms[door.ri]?.name || '';
      const isGarageDoor = (door.width || 0) >= 6 && /garage/i.test(roomName);
      doc.setDrawColor(...navy); doc.setLineWidth(0.6);
      if (isGarageDoor) {
        // Two parallel horizontal lines spanning the opening (overhead panel symbol)
        const ux = (p2x - p1x) / dw, uy = (p2y - p1y) / dw;
        const panelInset = 2.5;
        doc.line(p1x, p1y, p2x, p2y);
        doc.line(p1x + door.nx * panelInset, p1y + door.nz * panelInset,
                 p2x + door.nx * panelInset, p2y + door.nz * panelInset);
        // Short inward arrow at midpoint
        const midX = (p1x + p2x) / 2, midY = (p1y + p2y) / 2;
        const arrLen = dw * 0.12;
        doc.setLineWidth(0.4);
        doc.line(midX, midY, midX + door.nx * arrLen, midY + door.nz * arrLen);
        doc.line(midX + door.nx * arrLen, midY + door.nz * arrLen,
                 midX + door.nx * arrLen * 0.6 + ux * arrLen * 0.4,
                 midY + door.nz * arrLen * 0.6 + uy * arrLen * 0.4);
        doc.line(midX + door.nx * arrLen, midY + door.nz * arrLen,
                 midX + door.nx * arrLen * 0.6 - ux * arrLen * 0.4,
                 midY + door.nz * arrLen * 0.6 - uy * arrLen * 0.4);
      } else if ((door.width || 0) >= 4) {
        // Bi-fold: two V-chevrons side by side
        const midX = (p1x + p2x) / 2, midY = (p1y + p2y) / 2;
        const cheH = dw * 0.3;
        const q1x = (p1x + midX) / 2, q1y = (p1y + midY) / 2;
        const apex1x = q1x + door.nx * cheH, apex1y = q1y + door.nz * cheH;
        doc.line(p1x, p1y, apex1x, apex1y); doc.line(apex1x, apex1y, midX, midY);
        const q2x = (midX + p2x) / 2, q2y = (midY + p2y) / 2;
        const apex2x = q2x + door.nx * cheH, apex2y = q2y + door.nz * cheH;
        doc.line(midX, midY, apex2x, apex2y); doc.line(apex2x, apex2y, p2x, p2y);
      } else {
        const radius = Math.min(dw, 3 * scale);
        const panelEndX = p1x + door.nx * radius, panelEndY = p1y + door.nz * radius;
        doc.line(p1x, p1y, panelEndX, panelEndY);
        const arcStart = Math.atan2(door.nz, door.nx);
        const toEnd = Math.atan2(p2y - p1y, p2x - p1x);
        let diff = ((toEnd - arcStart) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        const sweep = diff >= 0 ? Math.PI / 2 : -Math.PI / 2;
        doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.4);
        _drawArc(doc, p1x, p1y, radius, arcStart, sweep);
      }
    }

    for (const win of allWindows) {
      const p1x = oX + win.x1 * scale, p1y = oY + win.z1 * scale;
      const p2x = oX + win.x2 * scale, p2y = oY + win.z2 * scale;
      const ww = Math.hypot(p2x - p1x, p2y - p1y);
      if (ww < 3) continue;
      _eraseGap(doc, p1x, p1y, p2x, p2y, FEAT_WALL_T);
      // Triple parallel lines (glass symbol)
      const ux = (p2x - p1x) / ww, uy = (p2y - p1y) / ww;
      const perp = [-uy, ux];
      const off = Math.min(ww * 0.1, 3.5);
      doc.setDrawColor(...navy); doc.setLineWidth(0.5);
      for (const o of [-off, 0, off]) {
        doc.line(p1x + perp[0] * o, p1y + perp[1] * o, p2x + perp[0] * o, p2y + perp[1] * o);
      }
    }

    // Openings = cased pass-throughs, no door symbol. If a walk-through renders with a swing arc
    // it means RoomPlan tagged it as a door — that is a sensor-side misclassification, not a
    // render bug. User-editable override deferred to future release.
    // [LIDAR_WARN] RoomPlan misclassified opening as door — user-editable override deferred to future release
    if (allOpenings.length > 0) console.log(`[LIDAR_DEBUG] rendering ${allOpenings.length} opening(s) as clean gaps (no swing arc)`);
    for (const op of allOpenings) {
      const p1x = oX + op.x1 * scale, p1y = oY + op.z1 * scale;
      const p2x = oX + op.x2 * scale, p2y = oY + op.z2 * scale;
      if (Math.hypot(p2x - p1x, p2y - p1y) < 3) continue;
      _eraseGap(doc, p1x, p1y, p2x, p2y, FEAT_WALL_T, FLOOR_TINT);
    }

    // ── Chain dimension lines — top / bottom / right edges (left omitted: title column) ───
    console.log('[LIDAR_PDF_STAGE] computing chain dims');
    const planCentX = trueW / 2, planCentZ = trueH / 2;
    const CHAIN_OFF = 20, OVERALL_OFF = 38;

    // Global bounding box of all wall segs — used to snap edge segs to a common plane
    let gMinX = Infinity, gMaxX = -Infinity, gMinZ = Infinity, gMaxZ = -Infinity;
    for (const seg of allWallSegs) {
      gMinX = Math.min(gMinX, seg.x1, seg.x2);
      gMaxX = Math.max(gMaxX, seg.x1, seg.x2);
      gMinZ = Math.min(gMinZ, seg.z1, seg.z2);
      gMaxZ = Math.max(gMaxZ, seg.z1, seg.z2);
    }
    const SNAP_TOL = 1.0; // ft — captures wall-thickness drift between adjacent rooms

    const topSegs = [], bottomSegs = [], rightSegs = [];
    for (const seg of allWallSegs) {
      if (seg.interior) continue;
      const len = Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1);
      if (len < 1.5) continue;
      const mx = (seg.x1 + seg.x2) / 2, mz = (seg.z1 + seg.z2) / 2;
      const wdx = seg.x2 - seg.x1, wdz = seg.z2 - seg.z1, wl = len || 1;
      let nx = -wdz / wl, nz = wdx / wl;
      if ((mx - planCentX) * nx + (mz - planCentZ) * nz < 0) { nx = -nx; nz = -nz; }
      if (nz < -0.85) {
        // Top edge — snap z to gMinZ if both endpoints are within SNAP_TOL
        const snapped = Math.abs(seg.z1 - gMinZ) < SNAP_TOL && Math.abs(seg.z2 - gMinZ) < SNAP_TOL;
        topSegs.push(snapped ? { ...seg, z1: gMinZ, z2: gMinZ, len } : { ...seg, len });
      } else if (nz > 0.85) {
        // Bottom edge — snap z to gMaxZ
        const snapped = Math.abs(seg.z1 - gMaxZ) < SNAP_TOL && Math.abs(seg.z2 - gMaxZ) < SNAP_TOL;
        bottomSegs.push(snapped ? { ...seg, z1: gMaxZ, z2: gMaxZ, len } : { ...seg, len });
      } else if (nx > 0.85) {
        // Right edge — snap x to gMaxX
        const snapped = Math.abs(seg.x1 - gMaxX) < SNAP_TOL && Math.abs(seg.x2 - gMaxX) < SNAP_TOL;
        rightSegs.push(snapped ? { ...seg, x1: gMaxX, x2: gMaxX, len } : { ...seg, len });
      }
      // left (nx < -0.85) skipped — title column is there
    }
    // Top chain: dim line above oY
    dimBoxes = [
      ..._renderChainDims(doc, topSegs,    oY - CHAIN_OFF,                   oY - OVERALL_OFF,                  -1, true,  oX, oY, scale),
      ..._renderChainDims(doc, bottomSegs, oY + trueH * scale + CHAIN_OFF,   oY + trueH * scale + OVERALL_OFF,  +1, true,  oX, oY, scale),
      ..._renderChainDims(doc, rightSegs,  oX + trueW * scale + CHAIN_OFF,   oX + trueW * scale + OVERALL_OFF,  +1, false, oX, oY, scale),
    ];

  } else {
    // Non-world mode: packing layout (single-room fallback)
    const maxDim = Math.max(...drawableRooms.map(r => {
      const p = _processWalls(r.wallSegments);
      return p ? Math.max(p.trueWidth, p.trueHeight) : Math.max(r.length || 1, r.width || 1);
    }), 1);
    scale = Math.min(availW / maxDim, availH / maxDim, 24);
    let curX = DL, curY = DT, rowH = 0;
    for (const room of drawableRooms) {
      const proc = _processWalls(room.wallSegments);
      const rw = Math.max(52, (proc ? proc.trueWidth : (room.length || 10)) * scale);
      const rh = Math.max(40, (proc ? proc.trueHeight : (room.width || 10)) * scale);
      if (curX + rw > DR && curX > DL) { curY += rowH + DIM + 6; curX = DL; rowH = 0; }
      roomLayouts.push({ room, proc, segs: proc ? proc.segs : null, x: curX, y: curY, w: rw, h: rh });
      curX += rw + DIM + 6; rowH = Math.max(rowH, rh);
    }
    // Draw walls
    for (const { room, proc, segs, x, y, w, h } of roomLayouts) {
      if (proc && segs) {
        for (const seg of segs) {
          _drawPoché(doc, x + seg.x1 * scale, y + seg.z1 * scale, x + seg.x2 * scale, y + seg.z2 * scale, 5);
        }
      } else {
        _drawPoché(doc, x, y, x + w, y, 5);
        _drawPoché(doc, x + w, y, x + w, y + h, 5);
        _drawPoché(doc, x + w, y + h, x, y + h, 5);
        _drawPoché(doc, x, y + h, x, y, 5);
      }
      // Dim lines for single-room path
      if (proc && segs) {
        const cxB = x + w / 2, czB = y + h / 2;
        for (const seg of segs) {
          if (seg.len < 1.5) continue;
          const p1x = x + seg.x1 * scale, p1y = y + seg.z1 * scale;
          const p2x = x + seg.x2 * scale, p2y = y + seg.z2 * scale;
          const wdx = seg.x2 - seg.x1, wdz = seg.z2 - seg.z1, wl = seg.len || 1;
          let nx = -wdz / wl, ny = wdx / wl;
          if (((p1x + p2x) / 2 - cxB) * nx + ((p1y + p2y) / 2 - czB) * ny < 0) { nx = -nx; ny = -ny; }
          _dimLine(doc, p1x, p1y, p2x, p2y, nx, ny, _feetInches(seg.len));
        }
      }
    }
  }

  // ── Room labels (name + sqft) — interior point, collision-checked vs dim labels ──
  console.log(`[LIDAR_PDF_STAGE] rendering room labels (${roomLayouts.length} rooms)`);
  // existingBoxes tracks all placed labels for inter-room collision avoidance too
  const existingBoxes = worldMode ? [...dimBoxes] : [];
  const _boxesOverlap = (ax, ay, aw, ah, bx, by, bw, bh) =>
    ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  const _labelCollides = (lx, ly, lw, lh) =>
    existingBoxes.some(b => _boxesOverlap(lx - lw/2, ly - lh/2, lw, lh, b.x, b.y, b.w, b.h));

  // Wall-margin helpers — test that all four corners of a label box (page coords)
  // are inside the room polygon AND at least WALL_MARGIN_PT away from every wall seg.
  const WALL_MARGIN_PT = 6;
  const _ptSegDistFt = (px, pz, s) => {
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1, len2 = dx*dx + dz*dz;
    if (len2 < 0.0001) return Math.hypot(px - s.x1, pz - s.z1);
    const t = Math.max(0, Math.min(1, ((px-s.x1)*dx + (pz-s.z1)*dz) / len2));
    return Math.hypot(px - s.x1 - t*dx, pz - s.z1 - t*dz);
  };
  const _labelFitsInRoom = (cx, cy, lw, lh, poly, roomSegs) => {
    const marginFt = WALL_MARGIN_PT / scale;
    const corners = [
      [(cx - lw/2 - oX) / scale, (cy - lh/2 - oY) / scale],
      [(cx + lw/2 - oX) / scale, (cy - lh/2 - oY) / scale],
      [(cx + lw/2 - oX) / scale, (cy + lh/2 - oY) / scale],
      [(cx - lw/2 - oX) / scale, (cy + lh/2 - oY) / scale],
    ];
    return corners.every(([px, pz]) =>
      _pointInPoly(px, pz, poly) &&
      (!roomSegs || roomSegs.every(s => _ptSegDistFt(px, pz, s) >= marginFt))
    );
  };

  for (const { room, segs, x, y, w, h } of roomLayouts) {
    // Phase 2 layout hint lookup: id first, name fallback
    const hint = layout_hints[room.id] || hints_by_name[room.name] || null;

    let labelX, labelY;
    let roomPoly = null;
    if (segs && segs.length >= 3) {
      roomPoly = _walkRingFromSegs(segs);
      if (roomPoly.length < 3) roomPoly = _segsToPolyPoints(segs, room.sqft);
      if (roomPoly.length >= 3) {
        // polylabel on the already-transformed polygon — same coord space as renderer
        const ring = roomPoly.map(p => [p.x, p.z]);
        const [plx, plz] = polylabel([ring], 0.5);
        labelX = oX + plx * scale;
        labelY = oY + plz * scale;
      } else {
        labelX = x + w / 2; labelY = y + h / 2;
      }
    } else {
      labelX = x + w / 2; labelY = y + h / 2;
    }

    // Derive sqft from the final drawn polygon (shoelace) — consistent regardless of bridge/fallback path.
    const sqft = (() => {
      if (roomPoly && roomPoly.length >= 3) {
        let a = 0;
        for (let i = 0; i < roomPoly.length; i++) {
          const j = (i + 1) % roomPoly.length;
          a += roomPoly[i].x * roomPoly[j].z - roomPoly[j].x * roomPoly[i].z;
        }
        const computed = Math.round(Math.abs(a) / 2);
        if (computed > 0) return computed;
      }
      return room.sqft || 0;
    })();

    // Always use full room name — bypass computeLayoutHints abbreviation.
    // Always render horizontal — shrink font to fit rather than rotating.
    const nameTxt = room.name || (hint ? hint.label_text : '—');
    const sfTxt = sqft > 0 ? `${sqft.toLocaleString()} sq ft` : null;
    const showSf = room.sf_visible !== false && !!sfTxt;

    // Shrink-to-fit: start from w/8, then cap so text stays within 85% of room width.
    let fs = Math.min(11, w / 8);
    const fitFs = w * 0.85 / Math.max(1, nameTxt.length * 0.55);
    fs = Math.max(6, Math.min(fs, fitFs));
    const nameW = nameTxt.length * fs * 0.55, nameH = fs + 2;

    // Wall-margin check: if label clips a wall, log but keep horizontal (no rotation).
    if (roomPoly && segs && segs.length >= 3) {
      const lw = nameW + 8, lh = 18;
      if (!_labelFitsInRoom(labelX, labelY, lw, lh, roomPoly, segs)) {
        console.log(`[LIDAR_PDF_LABEL] room "${nameTxt}" no clean horizontal placement`);
      }
    }

    // Collision check against dim labels
    if (_labelCollides(labelX, labelY - 4, nameW, nameH)) {
      if (roomPoly && segs && segs.length >= 3) {
        const ring = roomPoly.map(p => [p.x, p.z]);
        const [plx, plz] = polylabel([ring], 0.5);
        const altX = oX + plx * scale, altY = oY + plz * scale;
        if (!_labelCollides(altX, altY - 4, nameW, nameH)) { labelX = altX; labelY = altY; }
        else {
          fs = Math.max(6, fs * 0.9);
          if (_labelCollides(labelX, labelY - 4, nameTxt.length * fs * 0.55, fs + 2)) {
            console.warn(`[LIDAR_WARN] room label collision unresolved for ${nameTxt}`);
          }
        }
      }
    }

    doc.setFont('helvetica', 'bold'); doc.setFontSize(fs); doc.setTextColor(...navy);
    doc.text(nameTxt, labelX, labelY - 4, { align: 'center', baseline: 'middle' });
    existingBoxes.push({ x: labelX - nameW/2, y: labelY - 4 - nameH/2, w: nameW, h: nameH });
    if (showSf && sfTxt) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(100, 100, 100);
      doc.text(sfTxt, labelX, labelY + 7, { align: 'center', baseline: 'middle' });
    }
  }

  // ── Scale bar (bottom of drawing area) ───────────────────────────────────
  _drawScaleBar(doc, DL, DB + 14, scale);
};

// ─── Summary page (room details table, grouped by floor) — portrait letter 612×792 ──
const _renderSummaryPage = (doc, floors, job, pageNum, totalPages, logoDataUrl, normData = null) => {
  const W = 612;
  const navy = [10, 31, 68], gold = [201, 168, 76], gray = [107, 114, 128];
  const M = 48;

  doc.setFillColor(...navy); doc.rect(0, 0, W, 52, 'F');
  doc.setFillColor(...gold); doc.rect(0, 52, W, 3, 'F');
  if (logoDataUrl) {
    const logoSize = 40;
    doc.addImage(logoDataUrl, 'JPEG', M, 6, logoSize, logoSize);
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...gold);
    doc.text('AVENSTONE GROUP', M, 22);
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(200, 200, 200);
  doc.text('ROOM DETAILS', M, 50);
  doc.setFontSize(8); doc.setTextColor(180, 180, 180);
  doc.text(job.address || '', W - M, 22, { align: 'right' });

  const allRooms = floors.flatMap(f => f.rooms);
  const totalSqft = normData
    ? normData.rooms.reduce((s, r) => s + Math.round(r.area_sqft), 0)
    : allRooms.reduce((s, r) => {
        const poly = _polyAreaFromSegs(r.wallSegments || []);
        return s + (poly > 0 ? Math.round(poly) : (r.sqft || 0));
      }, 0);
  doc.text(`${totalSqft.toLocaleString()} sq ft total  ·  ${allRooms.length} room${allRooms.length !== 1 ? 's' : ''}`, W - M, 36, { align: 'right' });
  let y = 70;

  const cols = [M, M + 115, M + 180, M + 245, M + 318, M + 386, M + 425];
  const HEADERS = ['Room', 'Floor Area', 'Perimeter', 'Wall Area', 'Ceiling', 'Doors', 'Win.'];

  let gTotFloor = 0, gTotPerim = 0, gTotWallArea = 0, gTotDoors = 0, gTotWin = 0;
  let globalRoomIdx = 0;

  for (const floor of floors) {
    if (floors.length > 1) {
      // Floor sub-header
      if (y > 710) { doc.addPage(); y = M + 10; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...navy);
      doc.setFillColor(240, 244, 250);
      doc.rect(M - 4, y - 8, W - M * 2 + 8, 14, 'F');
      doc.text(floor.floorName.toUpperCase(), M, y);
      y += 14;
    }

    // Column headers
    if (y > 710) { doc.addPage(); y = M + 10; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...gray);
    HEADERS.forEach((lbl, i) => doc.text(lbl, cols[i], y));
    y += 5; doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 10;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(55, 65, 81);
    let fTotFloor = 0, fTotPerim = 0, fTotWallArea = 0, fTotWin = 0;

    // Dedupe shared-wall doors before counting — mirrors _dedupFeatures isDupDoor exactly.
    // Doors on a shared wall appear in both adjacent rooms' doorSegments; applying each
    // room's worldX/worldZ offset puts all doors in the same coordinate system for comparison.
    // Thresholds: 0.5 ft midpoint, 10% width ratio, 0.9 normal dot — identical to _dedupFeatures.
    // Attribution: first room (lower index) wins, matching _dedupFeatures dedup() first-wins rule.
    const _flatFloorDoors = floor.rooms.flatMap((rm, ri) => {
      const wx = rm.worldX || 0, wz = rm.worldZ || 0;
      return (rm.doorSegments || []).map(d => ({
        x1: wx + d.x1, z1: wz + d.z1, x2: wx + d.x2, z2: wz + d.z2,
        nx: d.nx || 0, nz: d.nz || 0, width: d.width || 3, _ri: ri,
      }));
    });
    const _keptFloorDoors = [];
    for (const d of _flatFloorDoors) {
      const dup = _keptFloorDoors.some(k => {
        if (Math.hypot((d.x1+d.x2)/2-(k.x1+k.x2)/2, (d.z1+d.z2)/2-(k.z1+k.z2)/2) > 0.5) return false;
        const aw = Math.hypot(d.x2-d.x1, d.z2-d.z1), bw = Math.hypot(k.x2-k.x1, k.z2-k.z1);
        if (Math.abs(aw-bw) / Math.max(aw, bw, 0.01) > 0.1) return false;
        return Math.abs(d.nx*k.nx + d.nz*k.nz) >= 0.9;
      });
      if (!dup) _keptFloorDoors.push(d);
    }
    const fTotDoors = _keptFloorDoors.length;

    for (let roomIdx = 0; roomIdx < floor.rooms.length; roomIdx++) {
      const room = floor.rooms[roomIdx];
      const normRoom = normData?.rooms[globalRoomIdx];
      globalRoomIdx++;
      if (y > 720) { doc.addPage(); y = M + 10; }
      const wallSegs = room.wallSegments || [];
      const worldMode = room.worldX !== undefined && room.worldX !== null;
      if (wallSegs.length < 3) {
        doc.text(room.name || '—', cols[0], y);
        doc.setTextColor(150, 150, 150); doc.text('Scan incomplete', cols[1], y); doc.setTextColor(55, 65, 81);
        y += 12; continue;
      }
      const proc = worldMode ? null : _processWalls(wallSegs);
      let sqft;
      if (normRoom) {
        sqft = Math.round(normRoom.area_sqft);
      } else {
        sqft = room.sqft || 0;
        if (worldMode) { const p = _polyAreaFromSegs(wallSegs); if (p > 0) sqft = Math.round(p); }
        else if (proc) { const p = _polyAreaFromSegs(proc.segs); if (p > 0) sqft = Math.round(p); }
      }
      const perim = _perimeterFromSegs(wallSegs);
      const wallArea = Math.round(wallSegs.reduce((s, seg) => s + Math.hypot(seg.x2-seg.x1, seg.z2-seg.z1) * (room.height || 0), 0));
      const doorCount = _keptFloorDoors.filter(d => d._ri === roomIdx).length;
      const winCount = (room.windowSegments || []).length;
      fTotFloor += sqft; fTotPerim += perim; fTotWallArea += wallArea; fTotWin += winCount;
      doc.text(room.name || '—', cols[0], y);
      doc.text(`${sqft.toLocaleString()} sf`, cols[1], y);
      doc.text(`${perim.toFixed(1)} ft`, cols[2], y);
      doc.text(`${wallArea.toLocaleString()} sf`, cols[3], y);
      doc.text(`${sqft.toLocaleString()} sf`, cols[4], y);
      doc.text(`${doorCount}`, cols[5], y);
      doc.text(`${winCount}`, cols[6], y);
      y += 12;
    }

    if (floors.length > 1 && floor.rooms.length > 0) {
      y += 2; doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.4); doc.line(M, y, W - M, y); y += 7;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...navy);
      doc.text(`${floor.floorName} Total`, cols[0], y);
      doc.text(`${fTotFloor.toLocaleString()} sf`, cols[1], y);
      doc.text(`${fTotPerim.toFixed(1)} ft`, cols[2], y);
      doc.text(`${fTotWallArea.toLocaleString()} sf`, cols[3], y);
      doc.text(`${fTotDoors}`, cols[5], y); doc.text(`${fTotWin}`, cols[6], y);
      y += 14;
    }
    gTotFloor += fTotFloor; gTotPerim += fTotPerim; gTotWallArea += fTotWallArea; gTotDoors += fTotDoors; gTotWin += fTotWin;
  }

  if (floors.length > 0) {
    y += 3; doc.setDrawColor(...gold); doc.setLineWidth(0.75); doc.line(M, y, W - M, y); y += 8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...navy);
    doc.text('TOTAL', cols[0], y);
    doc.text(`${gTotFloor.toLocaleString()} sf`, cols[1], y);
    doc.text(`${gTotPerim.toFixed(1)} ft`, cols[2], y);
    doc.text(`${gTotWallArea.toLocaleString()} sf`, cols[3], y);
    doc.text(`${gTotFloor.toLocaleString()} sf`, cols[4], y); // ceiling ≈ floor area
    doc.text(`${gTotDoors}`, cols[5], y); doc.text(`${gTotWin}`, cols[6], y);
    console.log(`[LIDAR_DEBUG] summary totals: floorArea=${gTotFloor} perimeter=${gTotPerim.toFixed(1)} wallArea=${gTotWallArea} ceiling=${gTotFloor} doors=${gTotDoors} windows=${gTotWin}`);
  }

  // Footer
  const pages = doc.getNumberOfPages();
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  doc.setPage(pageNum);
  doc.setFillColor(...navy); doc.rect(0, 772, W, 40, 'F');
  doc.setFontSize(8); doc.setTextColor(...gold); doc.setFont('helvetica', 'bold');
  doc.text('AVENSTONE GROUP LLC', M, 788);
  doc.setTextColor(180, 180, 180); doc.setFont('helvetica', 'normal');
  doc.text(`Page ${pageNum} of ${totalPages}`, W / 2, 788, { align: 'center' });
  doc.text(now, W - M, 788, { align: 'right' });
};

// ─── Main entry point ─────────────────────────────────────────────────────────
export const buildFloorPlanPDF = async (rawScan, job) => {
  try {
    console.log('[LIDAR_PDF_STAGE] buildFloorPlanPDF start');
    const logoDataUrl = await _loadLogo();
    const scan = applyEditOverrides(rawScan);

    // Phase 1+2: normalize → wall classification + layout hints. Falls back silently if malformed.
    let layout_hints = {}, hints_by_name = {}, wallClassByRoomAndSeg = {}, normalizedData = null;
    try {
      const normalized = normalizeFloorPlan(scan);
      if (normalized.ok) {
        normalizedData = normalized.data;
        // Wall classification lookup: { room_id: ['exterior','interior',...] } in wall-segment order
        for (const wall of normalizedData.walls) {
          if (!wallClassByRoomAndSeg[wall.room_id]) wallClassByRoomAndSeg[wall.room_id] = [];
          wallClassByRoomAndSeg[wall.room_id].push(wall.classification);
        }
        console.log(`[LIDAR_PDF_HINTS] wall classification loaded: ${Object.keys(wallClassByRoomAndSeg).length} rooms`);
        const hintsResult = computeLayoutHints(normalized);
        if (hintsResult.ok) {
          layout_hints = hintsResult.data.layout_hints;
          for (const [, h] of Object.entries(layout_hints)) {
            if (h.label_full_text) hints_by_name[h.label_full_text] = h;
          }
          const ambiguous = hintsResult.data.issues.filter(i => i.severity === 'ambiguous');
          const warns = hintsResult.data.issues.filter(i => i.severity === 'warn');
          if (ambiguous.length) console.warn('[LIDAR_PDF_HINTS] ambiguous layout issues (Phase 3 tiebreaker needed):', ambiguous);
          if (warns.length) console.log('[LIDAR_PDF_HINTS] layout warnings:', warns);
        }
      }
    } catch (e) {
      console.warn('[LIDAR_PDF_HINTS] normalize/hints failed, using legacy rendering:', e.message);
    }

    // Group normalized geometry by floor for per-floor rendering
    const normByFloor = {};
    if (normalizedData) {
      const roomFloorMap = Object.fromEntries(normalizedData.rooms.map(r => [r.id, r.floor ?? 0]));
      for (const room of normalizedData.rooms) {
        const fi = room.floor ?? 0;
        if (!normByFloor[fi]) normByFloor[fi] = { rooms: [], walls: [], doors: [], windows: [] };
        normByFloor[fi].rooms.push(room);
      }
      for (const wall of normalizedData.walls) {
        const fi = roomFloorMap[wall.room_id] ?? 0;
        if (normByFloor[fi]) normByFloor[fi].walls.push(wall);
      }
      for (const door of normalizedData.doors) {
        const fi = roomFloorMap[door.room_ids?.[0]] ?? 0;
        if (normByFloor[fi]) normByFloor[fi].doors.push(door);
      }
      for (const win of normalizedData.windows) {
        const fi = roomFloorMap[win.room_id] ?? 0;
        if (normByFloor[fi]) normByFloor[fi].windows.push(win);
      }
    }

    const rooms = scan.rooms || [];
    console.log('[LIDAR_DEBUG] Full rooms payload:', JSON.stringify(rooms, null, 2));
    console.log('[LIDAR_DEBUG] Names array:', rooms.map(r => r.name));
    console.log('[LIDAR_DEBUG] worldX/worldZ per room:', rooms.map(r => ({ name: r.name, worldX: r.worldX, worldZ: r.worldZ, objects: (r.objects || []).length, walls: (r.wallSegments || []).length })));

    console.log('[LIDAR_PDF_STAGE] grouping rooms by floor');
    const floors = _groupByFloor(rooms);
    const totalFloors = floors.length;
    const totalPages = totalFloors + 1;
    console.log(`[LIDAR_PDF_STAGE] ${totalFloors} floor(s), ${rooms.length} room(s)`);

    const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
    console.log('[LIDAR_PDF_STAGE] jsPDF doc created');

    floors.forEach((floor, fi) => {
      const W = 792, H = 612;
      console.log(`[LIDAR_PDF_STAGE] rendering floor page ${fi + 1}/${totalFloors} — ${floor.floorName}`);
      console.log(`[LIDAR_DEBUG] page ${fi + 1} orientation: W=${W} H=${H}`);
      if (fi > 0) doc.addPage('letter', 'landscape');
      _renderFloorPage(doc, floor, { ...job, captured_at: scan.created_at }, fi + 1, totalFloors, fi + 1, totalPages, W, H, logoDataUrl, layout_hints, hints_by_name, wallClassByRoomAndSeg, normByFloor[floor.floorIndex] ?? null);
    });

    console.log('[LIDAR_PDF_STAGE] rendering summary page');
    doc.addPage('letter', 'portrait');
    _renderSummaryPage(doc, floors, job, totalPages, totalPages, logoDataUrl, normalizedData);

    console.log('[LIDAR_PDF_STAGE] buildFloorPlanPDF complete');
    return doc;
  } catch (e) {
    console.error('[LIDAR_PDF_ERROR]', e);
    alert('PDF generation failed. Please try again.\n\nIf this keeps happening, contact support.\n\nError: ' + e.message);
  }
};

// ─── Default contract text ────────────────────────────────────────────────────
export const DEFAULT_CONTRACT_TEXT = (job, f$) => `CONSTRUCTION SERVICES AGREEMENT

This Construction Services Agreement ("Agreement") is entered into as of the date signed below between Avenstone Group LLC ("Contractor") and ${job.client_name || '[Client Name]'} ("Client") for the property located at ${job.address || '[Property Address]'}.

1. SCOPE OF WORK
Contractor agrees to furnish all labor, materials, equipment, and services necessary to complete the renovation work as described in the project scope ("the Work"). The specific scope, specifications, and any drawings are incorporated herein by reference.

2. CONTRACT PRICE
The total contract price for the Work is ${f$ ? f$(job.contract_value || 0) : '$0.00'} ("Contract Price"), subject to modifications via approved Change Orders.

3. PAYMENT SCHEDULE
A) Deposit: 25% due upon signing this Agreement.
B) Progress Payments: Invoiced at milestones mutually agreed upon.
C) Final Payment: Remaining balance due upon substantial completion.
All payments are due within 5 business days of invoice.

4. COMMENCEMENT AND COMPLETION
Work shall commence within 5 business days of receipt of the deposit. Estimated completion: ${job.target_completion || '[To be determined]'}. Delays caused by weather, materials availability, or Client-requested changes shall extend the schedule accordingly.

5. CHANGE ORDERS
Any changes to the scope of work must be documented in a written Change Order signed by both parties before work proceeds. Change Orders may adjust the Contract Price and/or schedule.

6. WARRANTIES
Contractor warrants all workmanship for a period of one (1) year from the date of substantial completion. Manufacturer warranties on materials are passed through to Client.

7. INSURANCE
Contractor maintains general liability insurance and workers' compensation coverage as required by Missouri law. Certificates of insurance are available upon request.

8. DISPUTE RESOLUTION
Any disputes arising under this Agreement shall first be submitted to mediation before pursuing other remedies. This Agreement shall be governed by the laws of the State of Missouri.

9. ENTIRE AGREEMENT
This Agreement, together with any attached exhibits and Change Orders, constitutes the entire agreement between the parties and supersedes all prior negotiations and representations.

By signing below, Client acknowledges reading and agreeing to all terms of this Agreement.`;
