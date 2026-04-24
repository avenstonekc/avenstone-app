import jsPDF from 'jspdf';
import { floorLabel as _floorLabel } from './captureTypes.js';

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
export const buildProposalPDF = (job, lineItems, scopeSummary, { pmFee = 0, margin = 25, proposalNum = '001', schedule = [] } = {}) => {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const navy = [10, 31, 68], gold = [201, 168, 76], gray = [107, 114, 128];
  const W = 612, M = 48;

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

  const sub = lineItems.reduce((a, l) => a + Number(l.amount || 0), 0);
  const profit = Math.round(sub * (Number(margin) / 100));
  const total = sub + Number(pmFee || 0) + profit;
  const fmt = n => `$${Number(n || 0).toLocaleString()}`;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy);
  [['Subtotal', fmt(sub)], ['PM Fee', fmt(pmFee)], [`Profit (${margin}%)`, fmt(profit)], ['TOTAL', fmt(total)]].forEach(([lb, val]) => {
    doc.text(lb, M, y); doc.text(val, W - M, y, { align: 'right' }); y += 14;
  });
  y += 10; doc.setDrawColor(...gold); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 16;

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
      return type === 'door' ? { ...b, nx: s.nx, nz: s.nz, width: s.width } : b;
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
const _segsToPolyPoints = (segs) => {
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
    if (bi === -1 || bd > 2.0) break;
    const n = rem.splice(bi, 1)[0];
    if (flip) { poly.push({ x: n.x2, z: n.z2 }); cx = n.x1; cz = n.z1; }
    else { poly.push({ x: n.x1, z: n.z1 }); cx = n.x2; cz = n.z2; }
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

// ─── Draw helpers ─────────────────────────────────────────────────────────────

// Filled poché rectangle for a wall segment (true double-line effect with black fill).
const _drawPoché = (doc, x1, y1, x2, y2, thick) => {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 0.5) return;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const px = -uy * thick / 2, py = ux * thick / 2;
  const c = [[x1 + px, y1 + py], [x2 + px, y2 + py], [x2 - px, y2 - py], [x1 - px, y1 - py]];
  doc.setFillColor(0, 0, 0);
  doc.lines([[c[1][0]-c[0][0], c[1][1]-c[0][1]], [c[2][0]-c[1][0], c[2][1]-c[1][1]], [c[3][0]-c[2][0], c[3][1]-c[2][1]]], c[0][0], c[0][1], [1, 1], 'F', true);
};

// Erase (white) rectangle at a door/window/opening gap.
const _eraseGap = (doc, p1x, p1y, p2x, p2y, wallThick) => {
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
  doc.setFillColor(255, 255, 255);
  doc.lines([[c[1][0]-c[0][0], c[1][1]-c[0][1]], [c[2][0]-c[1][0], c[2][1]-c[1][1]], [c[3][0]-c[2][0], c[3][1]-c[2][1]]], c[0][0], c[0][1], [1, 1], 'F', true);
};

// Architectural dimension line. (p1,p2) = wall endpoints in page coords. (nx,ny) = outward unit normal.
const _dimLine = (doc, p1x, p1y, p2x, p2y, nx, ny, label, { off = 44, lw = 0.75 } = {}) => {
  const ex1 = p1x + nx * off, ey1 = p1y + ny * off;
  const ex2 = p2x + nx * off, ey2 = p2y + ny * off;
  // Extension lines (thin gray)
  doc.setDrawColor(140, 140, 140); doc.setLineWidth(0.25);
  doc.line(p1x + nx * 6, p1y + ny * 6, ex1, ey1);
  doc.line(p2x + nx * 6, p2y + ny * 6, ex2, ey2);
  // Dim line (black)
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(lw);
  doc.line(ex1, ey1, ex2, ey2);
  // Tick marks — architectural 45° diagonal slashes
  const dl = Math.hypot(ex2 - ex1, ey2 - ey1) || 1;
  const tx = (ex2 - ex1) / dl, ty = (ey2 - ey1) / dl;
  const T = 4;
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

// Title block across the top of a floor-plan page.
const _drawTitleBlock = (doc, W, job, floorName, floorNum, totalFloors, pageNum, totalPages) => {
  const navy = [10, 31, 68], gold = [201, 168, 76], gray = [100, 100, 100];
  const M = 36, TB_H = 52;
  // Company name left
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...navy);
  doc.text('AVENSTONE GROUP', M, M + 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...gray);
  doc.text('FLOOR PLAN  ·  avenstonekc.com', M, M + 27);
  // Job info right
  const date = job.captured_at
    ? new Date(job.captured_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...navy);
  const addrLines = doc.splitTextToSize(job.address || 'Property Address', 260);
  doc.text(addrLines[0], W - M, M + 14, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...gray);
  let rY = M + 24;
  if (job.client_name) { doc.text(job.client_name, W - M, rY, { align: 'right' }); rY += 9; }
  doc.text(`Captured: ${date}`, W - M, rY, { align: 'right' }); rY += 9;
  const floorLabel = totalFloors > 1 ? `FLOOR ${floorNum} OF ${totalFloors}  —  ${floorName.toUpperCase()}` : floorName.toUpperCase();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...navy);
  doc.text(floorLabel, W - M, rY, { align: 'right' });
  // Gold divider
  doc.setDrawColor(...gold); doc.setLineWidth(0.75);
  doc.line(M, M + TB_H, W - M, M + TB_H);
  // Page N of M bottom-center (small)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...gray);
  doc.text(`Page ${pageNum} of ${totalPages}`, W / 2, M + TB_H - 5, { align: 'center' });
};

// ─── Floor page renderer ──────────────────────────────────────────────────────
const _renderFloorPage = (doc, floor, job, floorNum, totalFloors, pageNum, totalPages, W, H) => {
  const navy = [10, 31, 68];
  const M = 36, TB_H = 52, DIM = 54;

  _drawTitleBlock(doc, W, job, floor.floorName, floorNum, totalFloors, pageNum, totalPages);

  // Drawing bounds (inside dim bands)
  const DL = M + DIM, DR = W - M - DIM;
  const DT = M + TB_H + DIM, DB = H - M - DIM;
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

  if (worldMode) {
    const processed = _processAllRooms(drawableRooms);
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

    // Classify walls: interior = passes ALL 3 against a wall in a different room:
    //   midpoint within 0.5 ft, lengths within 15%, direction vectors parallel (|dot| >= 0.9)
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
    const extCnt = flatWalls.filter(w => !w.seg._interior).length;
    const intCnt = flatWalls.filter(w => !!w.seg._interior).length;
    console.log(`[LIDAR_DEBUG] walls: ${extCnt} exterior, ${intCnt} interior`);
    const isInterior = (seg) => !!seg._interior;

    // Collect all wall segs for dim labels
    drawableRooms.forEach((room, ri) => {
      const segs = roomSegs[ri] || [];
      segs.forEach(s => allWallSegs.push({ ...s, interior: isInterior(s) }));
    });

    // Build room layouts for label positioning
    roomLayouts = drawableRooms.map((room, ri) => {
      const segs = roomSegs[ri] || [];
      if (!segs.length) return null;
      const rxs = segs.flatMap(s => [s.x1, s.x2]), rzs = segs.flatMap(s => [s.z1, s.z2]);
      return { room, segs, x: oX + Math.min(...rxs) * scale, y: oY + Math.min(...rzs) * scale, w: (Math.max(...rxs) - Math.min(...rxs)) * scale, h: (Math.max(...rzs) - Math.min(...rzs)) * scale };
    }).filter(Boolean);

    // ── Draw walls (poché) ────────────────────────────────────────────────────
    for (const { segs } of roomLayouts) {
      for (const seg of segs) {
        const thick = isInterior(seg) ? 3 : 6;
        _drawPoché(doc, oX + seg.x1 * scale, oY + seg.z1 * scale, oX + seg.x2 * scale, oY + seg.z2 * scale, thick);
      }
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
      _eraseGap(doc, p1x, p1y, p2x, p2y, FEAT_WALL_T);
      // Jamb marks
      const ux = (p2x - p1x) / dw, uy = (p2y - p1y) / dw;
      const jLen = 5;
      doc.setDrawColor(...navy); doc.setLineWidth(1.5);
      doc.line(p1x - (-uy) * jLen, p1y - ux * jLen, p1x + (-uy) * jLen, p1y + ux * jLen);
      doc.line(p2x - (-uy) * jLen, p2y - ux * jLen, p2x + (-uy) * jLen, p2y + ux * jLen);
      // Door symbol: bi-fold (≥ 4 ft wide) or swing arc
      doc.setDrawColor(...navy); doc.setLineWidth(0.6);
      if ((door.width || 0) >= 4) {
        // Two V-chevrons side by side
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

    for (const op of allOpenings) {
      const p1x = oX + op.x1 * scale, p1y = oY + op.z1 * scale;
      const p2x = oX + op.x2 * scale, p2y = oY + op.z2 * scale;
      if (Math.hypot(p2x - p1x, p2y - p1y) < 3) continue;
      _eraseGap(doc, p1x, p1y, p2x, p2y, FEAT_WALL_T);
    }

    // ── Dimension lines — exterior walls only ─────────────────────────────────
    const planCentX = trueW / 2, planCentZ = trueH / 2;
    const dimLabeled = [];
    for (const seg of allWallSegs) {
      if (seg.interior) continue;
      const len = Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1);
      if (len < 0.8) continue;
      const mx = (seg.x1 + seg.x2) / 2, mz = (seg.z1 + seg.z2) / 2;
      const dup = dimLabeled.some(ls => {
        if (Math.hypot(mx - (ls.x1+ls.x2)/2, mz - (ls.z1+ls.z2)/2) > 0.4) return false;
        const ll = Math.hypot(ls.x2-ls.x1, ls.z2-ls.z1) || 1;
        return Math.abs(((seg.x2-seg.x1)/len)*((ls.x2-ls.x1)/ll) + ((seg.z2-seg.z1)/len)*((ls.z2-ls.z1)/ll)) > 0.93;
      });
      if (dup) continue;
      dimLabeled.push(seg);
      const wdx = seg.x2 - seg.x1, wdz = seg.z2 - seg.z1, wl = len || 1;
      let nx = -wdz / wl, nz = wdx / wl;
      if ((mx - planCentX) * nx + (mz - planCentZ) * nz < 0) { nx = -nx; nz = -nz; }
      const p1px = oX + seg.x1 * scale, p1py = oY + seg.z1 * scale;
      const p2px = oX + seg.x2 * scale, p2py = oY + seg.z2 * scale;
      _dimLine(doc, p1px, p1py, p2px, p2py, nx, nz, _feetInches(len));
    }
    // Overall building dimensions (heavier, farther offset)
    _dimLine(doc, oX, oY, oX + trueW * scale, oY, 0, -1, _feetInches(trueW), { off: 62, lw: 1.0 });
    _dimLine(doc, oX + trueW * scale, oY, oX + trueW * scale, oY + trueH * scale, 1, 0, _feetInches(trueH), { off: 62, lw: 1.0 });

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
          if (seg.len < 0.8) continue;
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

  // ── Room labels (name + sqft) — true centroid with interior-point fallback ──
  for (const { room, segs, x, y, w, h } of roomLayouts) {
    let labelX, labelY;
    if (segs && segs.length >= 3) {
      const poly = _segsToPolyPoints(segs);
      const cent = _polyCentroid(poly);
      if (_pointInPoly(cent.x, cent.z, poly)) {
        labelX = oX + cent.x * scale; labelY = oY + cent.z * scale;
      } else {
        const ip = _interiorPoint(poly, segs);
        labelX = oX + ip.x * scale; labelY = oY + ip.z * scale;
      }
    } else {
      labelX = x + w / 2; labelY = y + h / 2;
    }
    const sqft = (() => {
      if (segs && segs.length >= 3) { const a = _polyAreaFromSegs(segs); if (a > 0) return Math.round(a); }
      return room.sqft || 0;
    })();
    const fs = Math.max(7, Math.min(11, w / 8));
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fs); doc.setTextColor(...navy);
    doc.text(room.name || '—', labelX, labelY - 4, { align: 'center', baseline: 'middle' });
    if (sqft > 0) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(100, 100, 100);
      doc.text(`${sqft.toLocaleString()} sq ft`, labelX, labelY + 7, { align: 'center', baseline: 'middle' });
    }
  }

  // ── Scale bar ─────────────────────────────────────────────────────────────
  _drawScaleBar(doc, DL, DB + 10, scale);
};

// ─── Summary page (room details table, grouped by floor) ─────────────────────
const _renderSummaryPage = (doc, floors, job, pageNum, totalPages) => {
  const W = 612;
  const navy = [10, 31, 68], gold = [201, 168, 76], gray = [107, 114, 128];
  const M = 48;

  doc.setFillColor(...navy); doc.rect(0, 0, W, 52, 'F');
  doc.setFillColor(...gold); doc.rect(0, 52, W, 3, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...gold);
  doc.text('AVENSTONE GROUP', M, 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(200, 200, 200);
  doc.text('ROOM DETAILS', M, 36);
  doc.setFontSize(8); doc.setTextColor(180, 180, 180);
  doc.text(job.address || '', W - M, 22, { align: 'right' });

  const allRooms = floors.flatMap(f => f.rooms);
  const totalSqft = allRooms.reduce((s, r) => {
    const poly = _polyAreaFromSegs(r.wallSegments || []);
    return s + (poly > 0 ? Math.round(poly) : (r.sqft || 0));
  }, 0);
  doc.text(`${totalSqft.toLocaleString()} sq ft total  ·  ${allRooms.length} room${allRooms.length !== 1 ? 's' : ''}`, W - M, 36, { align: 'right' });
  let y = 70;

  const cols = [M, M + 115, M + 180, M + 245, M + 318, M + 386, M + 425];
  const HEADERS = ['Room', 'Floor Area', 'Perimeter', 'Wall Area', 'Ceiling', 'Doors', 'Win.'];

  let gTotFloor = 0, gTotDoors = 0, gTotWin = 0;

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
    let fTotFloor = 0, fTotDoors = 0, fTotWin = 0;

    for (const room of floor.rooms) {
      if (y > 720) { doc.addPage(); y = M + 10; }
      const wallSegs = room.wallSegments || [];
      const worldMode = room.worldX !== undefined && room.worldX !== null;
      if (wallSegs.length < 3) {
        doc.text(room.name || '—', cols[0], y);
        doc.setTextColor(150, 150, 150); doc.text('Scan incomplete', cols[1], y); doc.setTextColor(55, 65, 81);
        y += 12; continue;
      }
      const proc = worldMode ? null : _processWalls(wallSegs);
      let sqft = room.sqft || 0;
      if (worldMode) { const p = _polyAreaFromSegs(wallSegs); if (p > 0) sqft = Math.round(p); }
      else if (proc) { const p = _polyAreaFromSegs(proc.segs); if (p > 0) sqft = Math.round(p); }
      const perim = _perimeterFromSegs(wallSegs);
      const wallArea = Math.round(wallSegs.reduce((s, seg) => s + Math.hypot(seg.x2-seg.x1, seg.z2-seg.z1) * (room.height || 0), 0));
      const doorCount = (room.doorSegments || []).length, winCount = (room.windowSegments || []).length;
      fTotFloor += sqft; fTotDoors += doorCount; fTotWin += winCount;
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
      doc.text(`${fTotDoors}`, cols[5], y); doc.text(`${fTotWin}`, cols[6], y);
      y += 14;
    }
    gTotFloor += fTotFloor; gTotDoors += fTotDoors; gTotWin += fTotWin;
  }

  if (floors.length > 0) {
    y += 3; doc.setDrawColor(...gold); doc.setLineWidth(0.75); doc.line(M, y, W - M, y); y += 8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...navy);
    doc.text('TOTAL', cols[0], y);
    doc.text(`${gTotFloor.toLocaleString()} sf`, cols[1], y);
    doc.text('—', cols[2], y); doc.text('—', cols[3], y); doc.text('—', cols[4], y);
    doc.text(`${gTotDoors}`, cols[5], y); doc.text(`${gTotWin}`, cols[6], y);
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
export const buildFloorPlanPDF = (scan, job) => {
  const rooms = scan.rooms || [];
  console.log('[LIDAR_DEBUG] Full rooms payload:', JSON.stringify(rooms, null, 2));
  console.log('[LIDAR_DEBUG] Names array:', rooms.map(r => r.name));
  console.log('[LIDAR_DEBUG] worldX/worldZ per room:', rooms.map(r => ({ name: r.name, worldX: r.worldX, worldZ: r.worldZ, objects: (r.objects || []).length, walls: (r.wallSegments || []).length })));

  const floors = _groupByFloor(rooms);
  const totalFloors = floors.length;
  const totalPages = totalFloors + 1; // floor pages + summary page

  // Floor plan pages are always landscape letter (plan content is normalized to trueW ≥ trueH).
  const doc = new jsPDF({ unit: 'pt', format: [792, 612] });

  floors.forEach((floor, fi) => {
    const W = 792, H = 612;
    if (fi > 0) doc.addPage([792, 612]);
    _renderFloorPage(doc, floor, { ...job, captured_at: scan.created_at }, fi + 1, totalFloors, fi + 1, totalPages, W, H);
  });

  // Summary page (always portrait letter)
  doc.addPage('letter');
  _renderSummaryPage(doc, floors, job, totalPages, totalPages);

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
