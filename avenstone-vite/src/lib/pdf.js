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
  doc.text('avenstonekc.com · Kansas City, MO', W - M, 34, { align: 'right' });
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
    // Portrait → landscape 90° CW: (x,z) → (z, tw−x)
    normalized = normalized.map(s => {
      const out = { ...s, x1: s.z1, z1: tw-s.x1, x2: s.z2, z2: tw-s.x2 };
      if (s.t === 'door') { out.nx = s.nz; out.nz = -s.nx; }
      return out;
    });
    [tw, th] = [th, tw];
  }

  // Snap near-coincident wall endpoints to close corner gaps (wall thickness artifacts ~0.35ft)
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
      return type === 'door' ? { ...b, nx: s.nx, nz: s.nz, width: s.width } : b;
    })
  );

  return {
    roomSegs:     byRoom('wall'),
    roomDoors:    byRoom('door'),
    roomWindows:  byRoom('window'),
    roomOpenings: byRoom('opening'),
    trueW: tw, trueH: th,
  };
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

// Draw an arc as line segments. sweepAngle can be negative (CW).
const _drawArc = (doc, cx, cy, r, startAngle, sweepAngle, steps = 10) => {
  const da = sweepAngle / steps;
  let px = cx + r * Math.cos(startAngle), py = cy + r * Math.sin(startAngle);
  for (let i = 1; i <= steps; i++) {
    const a = startAngle + da * i;
    const nx = cx + r * Math.cos(a), ny = cy + r * Math.sin(a);
    doc.line(px, py, nx, ny);
    px = nx; py = ny;
  }
};

export const buildFloorPlanPDF = (scan, job) => {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const navy = [10, 31, 68], gold = [201, 168, 76], gray = [107, 114, 128];
  const W = 612, H = 792;
  const BORDER = 14;       // sheet border inset from page edge
  const M = BORDER + 8;    // content margin (22 pt)
  const DIM_OFF = 24;      // space outside drawing for dimension lines
  const WALL_PT = 3.5;     // wall stroke thickness
  const rooms = scan.rooms || [];
  const date = new Date(scan.created_at || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const totalSqft = rooms.reduce((s, r) => s + (r.sqft || 0), 0);

  // ── Sheet border (construction drawing style) ─────────────────────────────
  doc.setDrawColor(70, 70, 70); doc.setLineWidth(0.75);
  doc.rect(BORDER, BORDER, W - BORDER * 2, H - BORDER * 2, 'S');

  // ── Title block (bottom-right corner) ─────────────────────────────────────
  const TB_H = 68, TB_W = 285;
  const TB_X = W - BORDER - TB_W;
  const TB_Y = H - BORDER - TB_H;
  const SPLIT_X = TB_X + 72;

  doc.setDrawColor(70, 70, 70); doc.setLineWidth(0.75);
  doc.rect(TB_X, TB_Y, TB_W, TB_H, 'S');
  doc.line(SPLIT_X, TB_Y, SPLIT_X, TB_Y + TB_H);
  doc.line(TB_X, TB_Y + TB_H * 0.50, SPLIT_X, TB_Y + TB_H * 0.50);

  // Left-top: company name (navy fill)
  doc.setFillColor(...navy);
  doc.rect(TB_X + 0.5, TB_Y + 0.5, 71, TB_H * 0.50 - 0.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...gold);
  doc.text('AVENSTONE', TB_X + 36, TB_Y + 12, { align: 'center' });
  doc.text('GROUP', TB_X + 36, TB_Y + 21, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(180, 180, 180);
  doc.text('FLOOR PLAN', TB_X + 36, TB_Y + 30, { align: 'center' });

  // Left-bottom: scale + url
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...gray);
  doc.text('SCALE: AS SHOWN', TB_X + 36, TB_Y + TB_H * 0.50 + 11, { align: 'center' });
  doc.text('avenstonekc.com', TB_X + 36, TB_Y + TB_H * 0.50 + 20, { align: 'center' });

  // Right column: project info
  const ri = SPLIT_X + 5;
  let tby = TB_Y + 11;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...navy);
  const addrLines = doc.splitTextToSize(job.address || 'Property Address', TB_W - 80);
  addrLines.slice(0, 2).forEach(line => { doc.text(line, ri, tby); tby += 10; });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...gray);
  if (job.client_name) { doc.text(`Client: ${job.client_name}`, ri, tby); tby += 9; }
  doc.text(`Captured: ${date}`, ri, tby); tby += 9;
  doc.text(`${totalSqft.toLocaleString()} sq ft  ·  ${rooms.length} room${rooms.length !== 1 ? 's' : ''}`, ri, tby);

  // Page indicator bottom-left
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...gray);
  doc.text('1 / 2', BORDER + 5, H - BORDER - 4);

  // ── Diagram bounds ────────────────────────────────────────────────────────
  // Nearly full page: top margin to just above title block
  const DIAG_TOP = M;               // 22
  const DIAG_BTM = TB_Y - 14;      // ~696
  const DIAG_LEFT = M;              // 22
  const DIAG_RIGHT = W - M;         // 590
  const DIAG_W = DIAG_RIGHT - DIAG_LEFT;   // 568
  const DIAG_H = DIAG_BTM - DIAG_TOP;      // ~674
  const availW = DIAG_W - DIM_OFF * 2;     // 520
  const availH = DIAG_H - DIM_OFF * 2;     // ~626

  const worldMode = rooms.some(r => r.worldX !== undefined && r.worldX !== null);
  const roomData = rooms.map(room => ({ room, proc: worldMode ? null : _processWalls(room.wallSegments) }));

  if (roomData.length > 0) {
    let layout = [], scale = 1;
    let worldOriginX = DIAG_LEFT + DIM_OFF, worldOriginY = DIAG_TOP + DIM_OFF;
    let planTrueW = 0, planTrueH = 0;

    if (worldMode) {
      const processed = _processAllRooms(rooms);
      if (processed) {
        const { roomSegs, roomDoors, roomWindows, roomOpenings, trueW, trueH } = processed;
        planTrueW = trueW; planTrueH = trueH;
        scale = Math.min(availW / trueW, availH / trueH);
        const drawW = trueW * scale, drawH = trueH * scale;
        // Center the plan within the available drawing area
        worldOriginX = DIAG_LEFT + DIM_OFF + (availW - drawW) / 2;
        worldOriginY = DIAG_TOP + DIM_OFF + (availH - drawH) / 2;
        layout = rooms.map((room, ri) => {
          const segs = roomSegs[ri] || [];
          if (!segs.length) return { room, segs: [], doors: [], windows: [], openings: [], x: worldOriginX, y: worldOriginY, w: 40, h: 30 };
          const rxs = segs.flatMap(s => [s.x1, s.x2]), rzs = segs.flatMap(s => [s.z1, s.z2]);
          const rminX = Math.min(...rxs), rmaxX = Math.max(...rxs);
          const rminZ = Math.min(...rzs), rmaxZ = Math.max(...rzs);
          return {
            room, segs,
            doors: roomDoors[ri] || [],
            windows: roomWindows[ri] || [],
            openings: roomOpenings[ri] || [],
            x: worldOriginX + rminX * scale,
            y: worldOriginY + rminZ * scale,
            w: Math.max((rmaxX - rminX) * scale, 16),
            h: Math.max((rmaxZ - rminZ) * scale, 12),
          };
        });
      }
    } else {
      const maxDim = Math.max(
        ...roomData.map(({ room, proc }) =>
          proc ? Math.max(proc.trueWidth, proc.trueHeight) : Math.max(room.length || 1, room.width || 1)
        ), 1
      );
      scale = Math.min(availW / maxDim, availH / maxDim, 24);
      let curX = DIAG_LEFT + DIM_OFF, curY = DIAG_TOP + DIM_OFF, rowH = 0;
      layout = [];
      for (const { room, proc } of roomData) {
        const rw = Math.max(52, (proc ? proc.trueWidth : (room.length || 10)) * scale);
        const rh = Math.max(40, (proc ? proc.trueHeight : (room.width || 10)) * scale);
        if (curX + rw > DIAG_RIGHT - DIM_OFF && curX > DIAG_LEFT + DIM_OFF) {
          curY += rowH + DIM_OFF * 2 + 6; curX = DIAG_LEFT + DIM_OFF; rowH = 0;
        }
        layout.push({ room, proc, segs: null, x: curX, y: curY, w: rw, h: rh });
        curX += rw + DIM_OFF + 6; rowH = Math.max(rowH, rh);
      }
    }

    // ── Draw walls ────────────────────────────────────────────────────────────
    doc.setDrawColor(...navy); doc.setLineWidth(WALL_PT);
    for (const { proc, segs: itemSegs, x, y: ry, w, h } of layout) {
      if (!worldMode) { doc.setFillColor(238, 241, 247); doc.rect(x, ry, w, h, 'F'); doc.setDrawColor(...navy); }
      if (worldMode && itemSegs && itemSegs.length > 0) {
        for (const seg of itemSegs) {
          doc.line(worldOriginX + seg.x1 * scale, worldOriginY + seg.z1 * scale,
                   worldOriginX + seg.x2 * scale, worldOriginY + seg.z2 * scale);
        }
      } else if (proc) {
        for (const seg of proc.segs) {
          doc.line(x + seg.x1 * scale, ry + seg.z1 * scale, x + seg.x2 * scale, ry + seg.z2 * scale);
        }
      } else {
        doc.rect(x, ry, w, h, 'S');
      }
    }

    // ── Doors, windows, openings (world mode only) ────────────────────────────
    if (worldMode) {
      const drawn = new Set(); // deduplicate shared features between adjacent rooms
      for (const { doors, windows, openings } of layout) {
        // Doors: panel line + 90° arc
        doc.setDrawColor(...navy); doc.setLineWidth(0.75);
        for (const door of (doors || [])) {
          const key = `d${Math.round(door.x1*10)},${Math.round(door.z1*10)}`;
          if (drawn.has(key)) continue; drawn.add(key);
          const p1x = worldOriginX + door.x1 * scale, p1z = worldOriginY + door.z1 * scale;
          const p2x = worldOriginX + door.x2 * scale, p2z = worldOriginY + door.z2 * scale;
          const dw = Math.hypot(p2x - p1x, p2z - p1z);
          if (dw < 4) continue;
          // Panel: thin line from jamb1 in swing direction
          const panelX = p1x + door.nx * dw, panelZ = p1z + door.nz * dw;
          doc.setDrawColor(...navy); doc.setLineWidth(0.75);
          doc.line(p1x, p1z, panelX, panelZ);
          // Arc: 90° sweep from panel direction toward jamb2
          const arcStart = Math.atan2(door.nz, door.nx);
          const toJ2 = Math.atan2(p2z - p1z, p2x - p1x);
          let diff = ((toJ2 - arcStart) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          if (diff > Math.PI) diff -= Math.PI * 2;
          const sweep = diff >= 0 ? Math.PI / 2 : -Math.PI / 2;
          doc.setDrawColor(130, 130, 130); doc.setLineWidth(0.5);
          _drawArc(doc, p1x, p1z, dw, arcStart, sweep);
        }

        // Windows: triple-line symbol across opening
        doc.setDrawColor(...navy); doc.setLineWidth(0.75);
        for (const win of (windows || [])) {
          const key = `w${Math.round(win.x1*10)},${Math.round(win.z1*10)}`;
          if (drawn.has(key)) continue; drawn.add(key);
          const p1x = worldOriginX + win.x1 * scale, p1z = worldOriginY + win.z1 * scale;
          const p2x = worldOriginX + win.x2 * scale, p2z = worldOriginY + win.z2 * scale;
          const ww = Math.hypot(p2x - p1x, p2z - p1z);
          if (ww < 3) continue;
          // Direction perpendicular to the opening
          const dx = (p2x - p1x) / ww, dz = (p2z - p1z) / ww;
          const px = -dz, pz = dx; // perpendicular unit vector
          const off = Math.min(ww * 0.08, 4); // offset for triple lines
          doc.setLineWidth(0.5);
          for (const o of [-off, 0, off]) {
            doc.line(p1x + px * o, p1z + pz * o, p2x + px * o, p2z + pz * o);
          }
        }

        // Openings: end caps only (cased opening)
        doc.setDrawColor(...navy); doc.setLineWidth(1);
        for (const op of (openings || [])) {
          const key = `o${Math.round(op.x1*10)},${Math.round(op.z1*10)}`;
          if (drawn.has(key)) continue; drawn.add(key);
          const p1x = worldOriginX + op.x1 * scale, p1z = worldOriginY + op.z1 * scale;
          const p2x = worldOriginX + op.x2 * scale, p2z = worldOriginY + op.z2 * scale;
          const ow = Math.hypot(p2x - p1x, p2z - p1z);
          if (ow < 3) continue;
          const dx = (p2x - p1x) / ow, dz = (p2z - p1z) / ow;
          const px = -dz * 3, pz = dx * 3; // short perpendicular cap
          doc.line(p1x - px, p1z - pz, p1x + px, p1z + pz);
          doc.line(p2x - px, p2z - pz, p2x + px, p2z + pz);
        }
      }
    }

    // ── Wall segment labels — deduplicated across rooms in world mode ──────────
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(55, 55, 55);

    if (worldMode) {
      const allSegs = layout.flatMap(item => item.segs || []);
      // Overall plan centroid for outward-offset direction
      const allPts = allSegs.flatMap(s => [[s.x1, s.z1], [s.x2, s.z2]]);
      const planCX = allPts.length ? worldOriginX + allPts.reduce((a, p) => a + p[0], 0) / allPts.length * scale : worldOriginX;
      const planCZ = allPts.length ? worldOriginY + allPts.reduce((a, p) => a + p[1], 0) / allPts.length * scale : worldOriginY;
      // Deduplicate: skip any seg whose midpoint is within 0.4 ft of an already-labeled seg at the same angle
      const labeled = [];
      for (const seg of allSegs) {
        const len = Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1);
        if (len < 0.8) continue;
        const mx = (seg.x1 + seg.x2) / 2, mz = (seg.z1 + seg.z2) / 2;
        const dup = labeled.some(ls => {
          if (Math.hypot(mx - (ls.x1 + ls.x2) / 2, mz - (ls.z1 + ls.z2) / 2) > 0.4) return false;
          const ll = Math.hypot(ls.x2 - ls.x1, ls.z2 - ls.z1) || 1;
          return Math.abs(((seg.x2 - seg.x1) / len) * ((ls.x2 - ls.x1) / ll) +
                          ((seg.z2 - seg.z1) / len) * ((ls.z2 - ls.z1) / ll)) > 0.93;
        });
        if (dup) continue;
        labeled.push(seg);
        const smx = worldOriginX + mx * scale, smz = worldOriginY + mz * scale;
        const vx = smx - planCX, vz = smz - planCZ, vl = Math.sqrt(vx * vx + vz * vz) || 1;
        let lx = smx + (vx / vl) * 13, lz = smz + (vz / vl) * 13;
        // If label lands outside the drawing area, flip it inward to avoid overlapping dimension lines
        if (lx < DIAG_LEFT + DIM_OFF || lx > DIAG_RIGHT - DIM_OFF ||
            lz < DIAG_TOP + DIM_OFF || lz > DIAG_BTM - DIM_OFF) {
          lx = smx - (vx / vl) * 13; lz = smz - (vz / vl) * 13;
        }
        doc.text(`${len.toFixed(1)}'`, lx, lz, { align: 'center' });
      }
    } else {
      for (const { proc, x, y: ry, w, h } of layout) {
        if (!proc) continue;
        const cxB = x + w / 2, czB = ry + h / 2;
        for (const seg of proc.segs) {
          if (seg.len < 0.8) continue;
          const mx = x + (seg.x1 + seg.x2) / 2 * scale, mz = ry + (seg.z1 + seg.z2) / 2 * scale;
          const vx = mx - cxB, vz = mz - czB, vl = Math.sqrt(vx * vx + vz * vz) || 1;
          doc.text(`${seg.len.toFixed(1)}'`, mx + (vx / vl) * 10, mz + (vz / vl) * 10, { align: 'center' });
        }
      }
    }

    // ── Overall plan dimensions (world mode — replaces per-room dimension boxes) ─
    if (worldMode && planTrueW > 0 && planTrueH > 0) {
      const drawW = planTrueW * scale, drawH = planTrueH * scale;
      doc.setDrawColor(130, 130, 130); doc.setLineWidth(0.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(70, 70, 70);
      // Width dimension below plan
      const bdy = worldOriginY + drawH + 16;
      doc.line(worldOriginX, bdy, worldOriginX + drawW, bdy);
      doc.line(worldOriginX, bdy - 4, worldOriginX, bdy + 4);
      doc.line(worldOriginX + drawW, bdy - 4, worldOriginX + drawW, bdy + 4);
      doc.text(`${planTrueW.toFixed(1)} ft`, worldOriginX + drawW / 2, bdy + 9, { align: 'center' });
      // Height dimension right of plan
      const rdx = worldOriginX + drawW + 16;
      doc.line(rdx, worldOriginY, rdx, worldOriginY + drawH);
      doc.line(rdx - 4, worldOriginY, rdx + 4, worldOriginY);
      doc.line(rdx - 4, worldOriginY + drawH, rdx + 4, worldOriginY + drawH);
      doc.text(`${planTrueH.toFixed(1)} ft`, rdx + 7, worldOriginY + drawH / 2, { baseline: 'middle' });
    }

    // ── Room labels (name + sqft at centroid) ─────────────────────────────────
    for (const { room, proc, segs: itemSegs, x, y: ry, w, h } of layout) {
      // Use bounding box center — more reliable than endpoint centroid for L-shaped rooms
      const midX = x + w / 2;
      const midY = ry + h / 2;
      let displaySqft = room.sqft || 0;
      if (worldMode && itemSegs && itemSegs.length >= 3) {
        const poly = _polyAreaFromSegs(itemSegs); if (poly > 0) displaySqft = Math.round(poly);
      } else if (proc && proc.segs && proc.segs.length >= 3) {
        const poly = _polyAreaFromSegs(proc.segs); if (poly > 0) displaySqft = Math.round(poly);
      }
      const fs = Math.max(7, Math.min(11, w / 7));
      doc.setFont('helvetica', 'bold'); doc.setFontSize(fs); doc.setTextColor(...navy);
      doc.text(room.name || '—', midX, midY - (h > 44 ? 7 : 0), { align: 'center' });
      if (h > 28) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...gold);
        doc.text(`${displaySqft.toLocaleString()} sf`, midX, midY + 8, { align: 'center' });
      }
    }

    // ── Scale bar ─────────────────────────────────────────────────────────────
    const planBottom = worldMode
      ? worldOriginY + planTrueH * scale + DIM_OFF + 8
      : layout.reduce((m, l) => Math.max(m, l.y + l.h), 0) + 18;
    const sbY = Math.min(planBottom, DIAG_BTM - 8);
    const scaleBarFt = Math.max(1, Math.round(50 / scale));
    const scaleBarPx = scaleBarFt * scale;
    doc.setDrawColor(110, 110, 110); doc.setLineWidth(1.5);
    doc.line(DIAG_LEFT + 4, sbY, DIAG_LEFT + 4 + scaleBarPx, sbY);
    doc.line(DIAG_LEFT + 4, sbY - 4, DIAG_LEFT + 4, sbY + 4);
    doc.line(DIAG_LEFT + 4 + scaleBarPx, sbY - 4, DIAG_LEFT + 4 + scaleBarPx, sbY + 4);
    doc.setFontSize(6.5); doc.setTextColor(90, 90, 90); doc.setFont('helvetica', 'normal');
    doc.text(`${scaleBarFt} ft`, DIAG_LEFT + 4 + scaleBarPx / 2, sbY - 6, { align: 'center' });
  }

  // ── Page 2: Room Details ──────────────────────────────────────────────────
  doc.addPage();
  let y = M + 10;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...navy);
  doc.text('ROOM DETAILS', M, y); y += 13;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...gray);
  doc.text(job.address || '', M, y); y += 12;
  doc.setDrawColor(...gold); doc.setLineWidth(1.5); doc.line(M, y, W - M, y); y += 14;

  const cols = [M, M + 185, M + 290, M + 380, M + 455];
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...gray);
  ['Room', 'Dimensions', 'Height', 'Sq Ft'].forEach((h, i) => doc.text(h, cols[i], y));
  y += 5; doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 10;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(55, 65, 81);
  for (const { room, proc } of roomData) {
    if (y > 720) { doc.addPage(); y = M + 10; }
    const dw = proc ? proc.trueWidth : (room.length || 0);
    const dh = proc ? proc.trueHeight : (room.width || 0);
    let tableSqft = room.sqft || 0;
    if (worldMode && room.wallSegments && room.wallSegments.length >= 3) {
      const poly = _polyAreaFromSegs(room.wallSegments); if (poly > 0) tableSqft = Math.round(poly);
    } else if (proc && proc.segs && proc.segs.length >= 3) {
      const poly = _polyAreaFromSegs(proc.segs); if (poly > 0) tableSqft = Math.round(poly);
    }
    doc.text(room.name || '—', cols[0], y);
    doc.text(`${_dim(dw)} × ${_dim(dh)} ft`, cols[1], y);
    doc.text(`${_dim(room.height)} ft`, cols[2], y);
    doc.text(`${tableSqft.toLocaleString()}`, cols[3], y);
    y += 13;
  }

  // Footer on room-details pages only (page 1 uses the title block)
  const pages = doc.getNumberOfPages();
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  for (let i = 2; i <= pages; i++) {
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
