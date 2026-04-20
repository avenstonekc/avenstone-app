import jsPDF from 'jspdf';

// ─── Generic PDF (contract, signoff, etc.) ────────────────────────────────────
export const buildGenericPDF = ({ docType, job, bodyText, signaturePng }) => {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const navy = [10, 31, 68], gold = [201, 168, 76], gray = [107, 114, 128];
  const W = 612, M = 48, CW = W - M * 2;

  // Header
  doc.setFillColor(...navy); doc.rect(0, 0, W, 80, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...gold);
  doc.text('AVENSTONE GROUP', M, 34);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gold);
  doc.text(docType, M, 50);
  doc.setTextColor(200, 200, 200); doc.setFontSize(9);
  doc.text('avenstonekc.com \u00b7 Kansas City, MO', W - M, 34, { align: 'right' });

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

  // Footer on all pages
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
  doc.text('avenstonekc.com \u00b7 Kansas City, MO', W - M, 34, { align: 'right' });
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
export const buildProposalPDF = (job, lineItems, scopeSummary, { pmFee = 0, margin = 25, proposalNum = '001', schedule = [] } = {}) => {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const navy = [10, 31, 68], gold = [201, 168, 76], gray = [107, 114, 128];
  const W = 612, M = 48;

  // Header
  doc.setFillColor(...navy); doc.rect(0, 0, W, 80, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...gold);
  doc.text('AVENSTONE GROUP', M, 34);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gold);
  doc.text('PROPOSAL', M, 50);
  doc.setTextColor(200, 200, 200); doc.setFontSize(9);
  doc.text('avenstonekc.com \u00b7 Kansas City, MO', W - M, 34, { align: 'right' });
  doc.text(`Proposal #: ${proposalNum}`, W - M, 50, { align: 'right' });

  let y = 100;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...navy);
  doc.text(job.address || '', M, y); y += 16;
  if (job.client_name) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gray); doc.text(`Client: ${job.client_name}`, M, y); y += 14; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gray);
  doc.text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, M, y); y += 24;
  doc.setDrawColor(...gold); doc.setLineWidth(1.5); doc.line(M, y, W - M, y); y += 20;

  // Totals
  const sub = lineItems.reduce((a, l) => a + Number(l.amount || 0), 0);
  const profit = Math.round(sub * (Number(margin) / 100));
  const total = sub + Number(pmFee || 0) + profit;
  const fmt = n => `$${Number(n || 0).toLocaleString()}`;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy);
  [['Subtotal', fmt(sub)], ['PM Fee', fmt(pmFee)], [`Profit (${margin}%)`, fmt(profit)], ['TOTAL', fmt(total)]].forEach(([lb, val]) => {
    doc.text(lb, M, y); doc.text(val, W - M, y, { align: 'right' }); y += 14;
  });
  y += 10; doc.setDrawColor(...gold); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 16;

  // Line items by trade
  if (lineItems.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy);
    doc.text('SCOPE & PRICING', M, y); y += 14;
    let lastTrade = null;
    lineItems.forEach(li => {
      if (li.trade !== lastTrade) {
        if (y > 720) { doc.addPage(); y = 48; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...navy);
        doc.text(li.trade || '', M, y); y += 12; lastTrade = li.trade;
      }
      if (y > 720) { doc.addPage(); y = 48; }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(55, 65, 81);
      doc.text(`  ${li.description || ''}`, M, y);
      doc.text(fmt(li.amount), W - M, y, { align: 'right' });
      y += 12;
    });
    y += 8;
  }

  // Payment schedule
  if (schedule.length) {
    if (y > 680) { doc.addPage(); y = 48; }
    doc.setDrawColor(...gold); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 14;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy);
    doc.text('PAYMENT SCHEDULE', M, y); y += 14;
    schedule.forEach(ps => {
      if (y > 720) { doc.addPage(); y = 48; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...navy);
      doc.text(ps.milestone || '', M, y);
      doc.text(ps.timing || '', W / 2, y, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...gold);
      doc.text(fmt(ps.amount), W - M, y, { align: 'right' });
      y += 12;
    });
  }

  // Footer
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

// ─── Floor Plan PDF ───────────────────────────────────────────────────────────

// Round to 2 decimal places, handling Float32-origin noise (e.g. 27.299999... → 27.30)
const _r2 = n => parseFloat((+(n) || 0).toFixed(2));
const _dim = n => _r2(n).toFixed(2);

// Reconstruct an ordered polygon from unordered wall endpoint pairs.
// Returns array of {x, z} points if successful, null if walls don't form a clean polygon.
function _buildWallPolygon(wallSegs, eps = 0.5) {
  if (!wallSegs || wallSegs.length < 3) return null;

  // Snap nearby endpoints to the same point object
  const pts = [];
  const snap = (x, z) => {
    for (const p of pts) {
      if (Math.abs(p.x - x) < eps && Math.abs(p.z - z) < eps) return p;
    }
    const p = { x, z, id: pts.length };
    pts.push(p);
    return p;
  };

  const edges = [];
  for (const seg of wallSegs) {
    const a = snap(seg.x1, seg.z1);
    const b = snap(seg.x2, seg.z2);
    if (a.id !== b.id) edges.push([a, b]);
  }
  if (edges.length < 3) return null;

  // Build adjacency list
  const adj = new Map();
  for (const [a, b] of edges) {
    if (!adj.has(a.id)) adj.set(a.id, []);
    if (!adj.has(b.id)) adj.set(b.id, []);
    adj.get(a.id).push(b);
    adj.get(b.id).push(a);
  }

  // Walk the boundary polygon
  const start = pts[0];
  const poly = [start];
  let prev = null, cur = start;
  for (let i = 0; i < wallSegs.length + 2; i++) {
    const neighbors = adj.get(cur.id) || [];
    const next = neighbors.find(n => !prev || n.id !== prev.id);
    if (!next || next.id === start.id) break;
    poly.push(next);
    prev = cur;
    cur = next;
  }

  return poly.length >= 3 ? poly : null;
}

export const buildFloorPlanPDF = (scan, job) => {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const navy = [10, 31, 68], gold = [201, 168, 76], gray = [107, 114, 128];
  const W = 612, M = 48, CW = W - M * 2;
  const rooms = scan.rooms || [];
  const date = new Date(scan.created_at || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const totalSqft = rooms.reduce((s, r) => s + (r.sqft || 0), 0);

  // Header
  doc.setFillColor(...navy); doc.rect(0, 0, W, 80, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...gold);
  doc.text('AVENSTONE GROUP', M, 34);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gold);
  doc.text('FLOOR PLAN', M, 50);
  doc.setTextColor(200, 200, 200); doc.setFontSize(9);
  doc.text('avenstonekc.com \u00b7 Kansas City, MO', W - M, 34, { align: 'right' });

  // Property info
  let y = 100;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...navy);
  doc.text(job.address || 'Property Address', M, y); y += 16;
  if (job.client_name) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gray);
    doc.text(`Client: ${job.client_name}`, M, y); y += 14;
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gray);
  doc.text(`Captured: ${date}`, M, y);
  doc.text(`${totalSqft.toLocaleString()} sq ft \u00b7 ${rooms.length} room${rooms.length !== 1 ? 's' : ''}`, W - M, y, { align: 'right' });
  y += 22;
  doc.setDrawColor(...gold); doc.setLineWidth(1.5); doc.line(M, y, W - M, y); y += 16;

  // Floor plan diagram
  if (rooms.length > 0) {
    const PAD_R = 10;
    const maxDim = Math.max(...rooms.flatMap(r => [r.length || 1, r.width || 1]), 1);
    const scale = Math.min((CW * 0.58) / maxDim, 20);

    let curX = M, curY = y, rowH = 0;
    const layout = [];
    for (const room of rooms) {
      const rw = Math.max(52, (room.length || 10) * scale);
      const rh = Math.max(40, (room.width || 10) * scale);
      if (curX + rw > W - M && curX > M) { curY += rowH + PAD_R + 18; curX = M; rowH = 0; }
      layout.push({ room, x: curX, y: curY, w: rw, h: rh });
      curX += rw + PAD_R; rowH = Math.max(rowH, rh);
    }

    for (const { room, x, y: ry, w, h } of layout) {
      const poly = _buildWallPolygon(room.wallSegments);

      doc.setFillColor(235, 238, 244);
      doc.setDrawColor(...navy);
      doc.setLineWidth(2.5);

      if (poly) {
        // Draw the actual room shape from RoomPlan wall data
        const pdfPts = poly.map(p => ({ px: x + p.x * scale, py: ry + p.z * scale }));
        const lineArr = pdfPts.slice(1).map((p, i) => [p.px - pdfPts[i].px, p.py - pdfPts[i].py]);
        try {
          doc.lines(lineArr, pdfPts[0].px, pdfPts[0].py, [1, 1], 'FD', true);
        } catch (_) {
          doc.rect(x, ry, w, h, 'FD');
        }
      } else {
        // Fallback: bounding-box rectangle
        doc.rect(x, ry, w, h, 'FD');
      }

      // Centroid for text placement
      const cx = poly
        ? pdfPts => pdfPts.reduce((s, p) => s + p.px, 0) / pdfPts.length
        : () => x + w / 2;
      const cz = poly
        ? pdfPts => pdfPts.reduce((s, p) => s + p.py, 0) / pdfPts.length
        : () => ry + h / 2;
      const midX = poly
        ? poly.reduce((s, p) => s + p.x, 0) / poly.length * scale + x
        : x + w / 2;
      const midY = poly
        ? poly.reduce((s, p) => s + p.z, 0) / poly.length * scale + ry
        : ry + h / 2;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(Math.min(9, w / 6));
      doc.setTextColor(...navy);
      doc.text(room.name, midX, midY - 6, { align: 'center' });

      if (h > 44) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...gold);
        doc.text(`${(room.sqft || 0).toLocaleString()} sf`, midX, midY + 7, { align: 'center' });
      }

      // Dimension label below room box
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 140);
      doc.setFont('helvetica', 'normal');
      doc.text(`${_dim(room.length)} × ${_dim(room.width)} ft`, x + w / 2, ry + h + 10, { align: 'center' });
    }

    const diagramBottom = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0) + 18;
    const scaleBarFt = Math.round(40 / scale) || 10;
    const scaleBarPx = scaleBarFt * scale;
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(1);
    doc.line(M, diagramBottom, M + scaleBarPx, diagramBottom);
    doc.line(M, diagramBottom - 3, M, diagramBottom + 3);
    doc.line(M + scaleBarPx, diagramBottom - 3, M + scaleBarPx, diagramBottom + 3);
    doc.setFontSize(7); doc.setTextColor(160, 160, 160); doc.setFont('helvetica', 'normal');
    doc.text(`${scaleBarFt} ft`, M + scaleBarPx / 2, diagramBottom - 5, { align: 'center' });
    y = diagramBottom + 22;
  }

  // Room table
  doc.setDrawColor(...gold); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 14;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...navy);
  doc.text('ROOM DETAILS', M, y); y += 12;
  const cols = [M, M + 185, M + 295, M + 385, M + 460];
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...gray);
  ['Room', 'Dimensions', 'Height', 'Sq Ft'].forEach((h, i) => doc.text(h, cols[i], y));
  y += 4; doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 10;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(55, 65, 81);
  for (const room of rooms) {
    if (y > 720) { doc.addPage(); y = 48; }
    doc.text(room.name || '—', cols[0], y);
    doc.text(`${_dim(room.length)} \u00d7 ${_dim(room.width)} ft`, cols[1], y);
    doc.text(`${_dim(room.height)} ft`, cols[2], y);
    doc.text(`${(room.sqft || 0).toLocaleString()}`, cols[3], y);
    y += 12;
  }

  // Footer
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
