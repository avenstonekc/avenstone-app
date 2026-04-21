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

// For multi-room world-space mode: rotate the entire plan so the longest wall is horizontal.
// Returns { roomSegs: [[{x1,z1,x2,z2}]], trueW, trueH } or null.
const _processAllRooms = (rooms) => {
  const flat = [];
  rooms.forEach((room, ri) => {
    const wx = room.worldX || 0, wz = room.worldZ || 0;
    (room.wallSegments || []).forEach(s => {
      flat.push({ x1: wx + s.x1, z1: wz + s.z1, x2: wx + s.x2, z2: wz + s.z2, ri });
    });
  });
  if (!flat.length) return null;

  const withLen = flat.map(s => ({ ...s, len: Math.hypot(s.x2 - s.x1, s.z2 - s.z1) }));
  const longest = withLen.reduce((a, b) => b.len > a.len ? b : a);
  let angle = Math.atan2(longest.z2 - longest.z1, longest.x2 - longest.x1);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  const ca = Math.cos(-angle), sa = Math.sin(-angle);
  const rot = (x, z) => [x * ca - z * sa, x * sa + z * ca];

  const rotated = withLen.map(s => {
    const [x1, z1] = rot(s.x1, s.z1), [x2, z2] = rot(s.x2, s.z2);
    return { ...s, x1, z1, x2, z2 };
  });

  const xs = rotated.flatMap(s => [s.x1, s.x2]), zs = rotated.flatMap(s => [s.z1, s.z2]);
  const minX = Math.min(...xs), minZ = Math.min(...zs);
  const maxX = Math.max(...xs), maxZ = Math.max(...zs);
  let tw = maxX - minX || 1, th = maxZ - minZ || 1;

  let normalized = rotated.map(s => ({ ...s, x1: s.x1 - minX, z1: s.z1 - minZ, x2: s.x2 - minX, z2: s.z2 - minZ }));
  if (th > tw) {
    // Portrait → landscape 90° CW: (x,z) → (z, tw−x)
    normalized = normalized.map(s => ({ ...s, x1: s.z1, z1: tw - s.x1, x2: s.z2, z2: tw - s.x2 }));
    [tw, th] = [th, tw];
  }

  const roomSegs = rooms.map((_, ri) =>
    normalized.filter(s => s.ri === ri).map(s => ({ x1: s.x1, z1: s.z1, x2: s.x2, z2: s.z2 }))
  );
  return { roomSegs, trueW: tw, trueH: th };
};

// Chain wall segments into an ordered polygon and compute area via shoelace (ft²).
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
    else       { poly.push({ x: n.x1, z: n.z1 }); cx = n.x2; cz = n.z2; }
  }
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].z - poly[j].x * poly[i].z;
  }
  return Math.abs(area) / 2;
};

// Rotate wallSegments so the longest wall is horizontal, normalize to (0,0) origin.
// Returns { segs: [{x1,z1,x2,z2,len}], trueWidth, trueHeight } or null if degenerate.
const _processWalls = (wallSegs) => {
  if (!wallSegs || wallSegs.length === 0) return null;
  const withLen = wallSegs.map(s => {
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
    return { ...s, len: Math.sqrt(dx * dx + dz * dz) };
  });
  const longest = withLen.reduce((a, b) => b.len > a.len ? b : a);
  // Normalize to [-π/2, π/2] so wall direction (x1→x2 vs x2→x1) doesn't mirror the result
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
  let segs = rots.map(s => ({
    x1: s.x1 - minX, z1: s.z1 - minZ,
    x2: s.x2 - minX, z2: s.z2 - minZ,
    len: s.len,
  }));
  let tw = maxX - minX, th = maxZ - minZ;
  if (tw < 0.5 || th < 0.5) return null; // degenerate scan
  // If portrait → rotate 90° CW to landscape: (x,z) → (z, tw−x)
  if (th > tw) {
    segs = segs.map(s => ({ x1: s.z1, z1: tw - s.x1, x2: s.z2, z2: tw - s.x2, len: s.len }));
    [tw, th] = [th, tw];
  }
  return { segs, trueWidth: tw, trueHeight: th };
};

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

  // ── Floor plan diagram ──────────────────────────────────────────────────────
  const worldMode = rooms.some(r => r.worldX !== undefined && r.worldX !== null);
  const roomData = rooms.map(room => ({ room, proc: worldMode ? null : _processWalls(room.wallSegments) }));

  if (roomData.length > 0) {
    const WALL_PT = 4;   // wall stroke thickness (pt)
    const DIM_OFF = 20;  // px between room edge and dimension line
    let layout, scale, worldOriginX = M, worldOriginY = y;

    if (worldMode) {
      // Rotate entire plan so longest wall is horizontal, then fit to page
      const processed = _processAllRooms(rooms);
      if (processed) {
        const { roomSegs, trueW, trueH } = processed;
        const availW = CW - DIM_OFF * 2;
        const availH = 390; // budget leaving room for scale bar + table
        scale = Math.min(availW / trueW, availH / trueH);
        const drawW = trueW * scale;
        worldOriginX = M + DIM_OFF + (availW - drawW) / 2;
        worldOriginY = y + DIM_OFF;
        layout = rooms.map((room, ri) => {
          const segs = roomSegs[ri] || [];
          if (!segs.length) return { room, segs: [], proc: null, x: worldOriginX, y: worldOriginY, w: 40, h: 30 };
          const rxs = segs.flatMap(s => [s.x1, s.x2]), rzs = segs.flatMap(s => [s.z1, s.z2]);
          const rminX = Math.min(...rxs), rmaxX = Math.max(...rxs);
          const rminZ = Math.min(...rzs), rmaxZ = Math.max(...rzs);
          return {
            room, segs, proc: null,
            x: worldOriginX + rminX * scale,
            y: worldOriginY + rminZ * scale,
            w: Math.max((rmaxX - rminX) * scale, 20),
            h: Math.max((rmaxZ - rminZ) * scale, 16),
          };
        });
      } else { layout = []; }
    } else {
      // Packing layout for single-room or non-world-space scans
      const maxDim = Math.max(
        ...roomData.map(({ room, proc }) =>
          proc ? Math.max(proc.trueWidth, proc.trueHeight) : Math.max(room.length || 1, room.width || 1)
        ), 1
      );
      scale = Math.min((CW * 0.55) / maxDim, 20);
      let curX = M, curY = y, rowH = 0;
      layout = [];
      for (const { room, proc } of roomData) {
        const rw = Math.max(52, (proc ? proc.trueWidth : (room.length || 10)) * scale);
        const rh = Math.max(40, (proc ? proc.trueHeight : (room.width || 10)) * scale);
        if (curX + rw > W - M && curX > M) { curY += rowH + DIM_OFF * 2 + 10; curX = M; rowH = 0; }
        layout.push({ room, proc, segs: null, x: curX, y: curY, w: rw, h: rh });
        curX += rw + DIM_OFF * 2 + 6; rowH = Math.max(rowH, rh);
      }
    }

    // ── Draw each room ──────────────────────────────────────────────────────────
    for (const { room, proc, segs: itemSegs, x, y: ry, w, h } of layout) {
      // Fill (packing mode only)
      if (!worldMode) { doc.setFillColor(235, 238, 244); doc.rect(x, ry, w, h, 'F'); }

      // Walls
      doc.setDrawColor(...navy); doc.setLineWidth(WALL_PT);
      if (worldMode && itemSegs && itemSegs.length > 0) {
        for (const seg of itemSegs) {
          doc.line(worldOriginX + seg.x1 * scale, worldOriginY + seg.z1 * scale,
                   worldOriginX + seg.x2 * scale, worldOriginY + seg.z2 * scale);
        }
        // Individual wall segment lengths offset outward
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(80, 80, 80);
        const cxR = x + w / 2, czR = ry + h / 2;
        for (const seg of itemSegs) {
          const len = Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1);
          if (len < 1) continue;
          const mx = worldOriginX + (seg.x1 + seg.x2) / 2 * scale;
          const mz = worldOriginY + (seg.z1 + seg.z2) / 2 * scale;
          const vx = mx - cxR, vz = mz - czR;
          const vl = Math.sqrt(vx * vx + vz * vz) || 1;
          doc.text(`${len.toFixed(1)}'`, mx + (vx / vl) * 11, mz + (vz / vl) * 11, { align: 'center' });
        }
      } else if (proc) {
        for (const seg of proc.segs) {
          doc.line(x + seg.x1 * scale, ry + seg.z1 * scale, x + seg.x2 * scale, ry + seg.z2 * scale);
        }
        // Wall segment lengths
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(80, 80, 80);
        const cxB = w / 2, czB = h / 2;
        for (const seg of proc.segs) {
          if (seg.len < 1) continue;
          const mx = (seg.x1 + seg.x2) / 2 * scale, mz = (seg.z1 + seg.z2) / 2 * scale;
          const vx = mx - cxB, vz = mz - czB, vl = Math.sqrt(vx * vx + vz * vz) || 1;
          doc.text(`${seg.len.toFixed(1)}'`, x + mx + (vx / vl) * 9, ry + mz + (vz / vl) * 9, { align: 'center' });
        }
      } else {
        doc.rect(x, ry, w, h, 'S');
      }

      // ── Dimension lines (overall bounding box) ─────────────────────────────────
      const dimWft = (w / scale).toFixed(1), dimHft = (h / scale).toFixed(1);
      doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.6);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
      // Bottom: width
      const bdy = ry + h + 8;
      doc.line(x, bdy, x + w, bdy);
      doc.line(x, bdy - 3, x, bdy + 3);
      doc.line(x + w, bdy - 3, x + w, bdy + 3);
      doc.text(`${dimWft} ft`, x + w / 2, bdy + 7, { align: 'center' });
      // Right: height
      const rdx = x + w + 8;
      doc.line(rdx, ry, rdx, ry + h);
      doc.line(rdx - 3, ry, rdx + 3, ry);
      doc.line(rdx - 3, ry + h, rdx + 3, ry + h);
      doc.text(`${dimHft} ft`, rdx + 4, ry + h / 2, { baseline: 'middle' });

      // ── Room label (centroid) ──────────────────────────────────────────────────
      let midX, midY;
      if (worldMode && itemSegs && itemSegs.length > 0) {
        const allPts = itemSegs.flatMap(s => [[s.x1, s.z1], [s.x2, s.z2]]);
        midX = worldOriginX + allPts.reduce((a, p) => a + p[0], 0) / allPts.length * scale;
        midY = worldOriginY + allPts.reduce((a, p) => a + p[1], 0) / allPts.length * scale;
      } else {
        midX = x + w / 2; midY = ry + h / 2;
      }

      // Shoelace sqft from actual polygon (accurate for L-shapes and bump-outs)
      let displaySqft = room.sqft || 0;
      if (worldMode && itemSegs && itemSegs.length >= 3) {
        const poly = _polyAreaFromSegs(itemSegs);
        if (poly > 0) displaySqft = Math.round(poly);
      } else if (proc && proc.segs && proc.segs.length >= 3) {
        const poly = _polyAreaFromSegs(proc.segs);
        if (poly > 0) displaySqft = Math.round(poly);
      }

      doc.setFont('helvetica', 'bold'); doc.setFontSize(Math.max(7, Math.min(10, w / 8))); doc.setTextColor(...navy);
      doc.text(room.name, midX, midY - (h > 44 ? 7 : 0), { align: 'center' });
      if (h > 36) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...gold);
        doc.text(`${displaySqft.toLocaleString()} sf`, midX, midY + 7, { align: 'center' });
      }
    }

    // ── Scale bar ──────────────────────────────────────────────────────────────
    const diagramBottom = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0) + DIM_OFF + 14;
    const scaleBarFt = Math.round(40 / scale) || 10;
    const scaleBarPx = scaleBarFt * scale;
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(1);
    doc.line(M, diagramBottom, M + scaleBarPx, diagramBottom);
    doc.line(M, diagramBottom - 3, M, diagramBottom + 3);
    doc.line(M + scaleBarPx, diagramBottom - 3, M + scaleBarPx, diagramBottom + 3);
    doc.setFontSize(7); doc.setTextColor(160, 160, 160); doc.setFont('helvetica', 'normal');
    doc.text(`${scaleBarFt} ft`, M + scaleBarPx / 2, diagramBottom - 5, { align: 'center' });
    y = diagramBottom + 18;
  }

  // ── Room details table ───────────────────────────────────────────────────────
  doc.setDrawColor(...gold); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 14;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...navy);
  doc.text('ROOM DETAILS', M, y); y += 12;
  const cols = [M, M + 185, M + 295, M + 385, M + 460];
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...gray);
  ['Room', 'Dimensions', 'Height', 'Sq Ft'].forEach((h, i) => doc.text(h, cols[i], y));
  y += 4; doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 10;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(55, 65, 81);
  for (const { room, proc } of roomData) {
    if (y > 720) { doc.addPage(); y = 48; }
    const dw = proc ? proc.trueWidth : (room.length || 0);
    const dh = proc ? proc.trueHeight : (room.width || 0);
    // Use shoelace area if wall segments available for accurate non-rectangular sqft
    let tableSqft = room.sqft || 0;
    if (worldMode && room.wallSegments && room.wallSegments.length >= 3) {
      const poly = _polyAreaFromSegs(room.wallSegments);
      if (poly > 0) tableSqft = Math.round(poly);
    } else if (proc && proc.segs && proc.segs.length >= 3) {
      const poly = _polyAreaFromSegs(proc.segs);
      if (poly > 0) tableSqft = Math.round(poly);
    }
    doc.text(room.name || '—', cols[0], y);
    doc.text(`${_dim(dw)} \u00d7 ${_dim(dh)} ft`, cols[1], y);
    doc.text(`${_dim(room.height)} ft`, cols[2], y);
    doc.text(`${tableSqft.toLocaleString()}`, cols[3], y);
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
