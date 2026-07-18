// CONSULTATION_MODE Slice 3 — branded, SCOPE-ONLY consultation recap PDF.
//
// Deliberately a NEW file that COPIES the buildGenericPDF house style (navy/gold header +
// footer) rather than editing pdf.js — pdf.js is in flight in the LIDAR window. ZERO dollars
// anywhere on this document: it is "what the bid will be based on," not the bid.

import jsPDF from 'jspdf';

const NAVY = [10, 31, 68], GOLD = [201, 168, 76], GRAY = [107, 114, 128], INK = [55, 65, 81];
const W = 612, M = 48, CW = W - M * 2;

const dataUrl = (url) => new Promise((resolve) => {
  if (!url) return resolve(null);
  fetch(url)
    .then((r) => r.blob())
    .then((blob) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    })
    .catch(() => resolve(null));
});

export async function buildRecapPDF({ job = {}, recap = {}, measurements = [], photos = [], sessionType = 'client_walk', tradeScope = [], recipientName = null }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  let y = 100;

  // WALKTHROUGH_TYPES — a sub walk relabels the document as a trade work order (still no dollars).
  const isSub = sessionType === 'sub_walk';
  const trades = (Array.isArray(tradeScope) ? tradeScope : []).filter(Boolean).join(', ');

  const ensure = (needed = 0) => { if (y + needed > 730) { doc.addPage(); y = 60; } };

  const heading = (txt) => {
    ensure(30);
    y += 6;
    doc.setDrawColor(...GOLD); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 16;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY);
    doc.text(txt, M, y); y += 16;
  };

  const bullets = (items) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...INK);
    (items || []).forEach((it) => {
      const lines = doc.splitTextToSize(`•  ${it}`, CW);
      lines.forEach((ln) => { ensure(14); doc.text(ln, M, y); y += 14; });
    });
  };

  // ── Header ──
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 80, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...GOLD);
  doc.text('AVENSTONE GROUP', M, 34);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GOLD);
  doc.text(isSub ? 'Sub Walkthrough — Scope of Work' : 'Consultation Recap', M, 50);
  doc.setTextColor(200, 200, 200); doc.setFontSize(9);
  doc.text('avenstonekc.com · Kansas City, MO', W - M, 34, { align: 'right' });

  // ── Job / client / date ──
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text(job.address || '', M, y); y += 16;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...GRAY);
  if (isSub) {
    if (trades) { doc.text(`Trade(s): ${trades}`, M, y); y += 14; }
    if (recipientName) { doc.text(`Prepared for: ${recipientName}`, M, y); y += 14; }
  } else if (job.client_name) {
    doc.text(`Client: ${job.client_name}`, M, y); y += 14;
  }
  doc.text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, M, y); y += 20;

  // ── Summary ──
  if (recap.summary) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...INK);
    doc.splitTextToSize(recap.summary, CW).forEach((ln) => { ensure(15); doc.text(ln, M, y); y += 15; });
    y += 6;
  }

  // ── What we discussed ──
  if ((recap.discussed_items || []).length) { heading(isSub ? 'Scope of work' : 'What we discussed'); bullets(recap.discussed_items); }

  // ── Scope basis / site conditions ──
  if ((recap.scope_basis || []).length) { heading(isSub ? 'Site conditions & access' : 'What your bid will be based on'); bullets(recap.scope_basis); }

  // ── Measurements ──
  const withFields = (measurements || []).filter((m) => m && m.fields && Object.keys(m.fields).length);
  if (withFields.length) {
    heading('Measurements taken on site');
    withFields.forEach((m) => {
      ensure(16);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY);
      doc.text(String(m.trade || 'Trade'), M, y); y += 14;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...INK);
      Object.entries(m.fields).forEach(([k, v]) => {
        ensure(13);
        doc.text(`   ${k.replace(/_/g, ' ')}: ${v}`, M, y); y += 13;
      });
      y += 4;
    });
  }

  // ── Photos with captions ──
  const shots = (photos || []).filter((p) => p && p.url);
  if (shots.length) {
    heading('Photos');
    for (const p of shots) {
      const img = await dataUrl(p.url);
      const imgH = 150, imgW = 200;
      ensure(imgH + 30);
      if (img) {
        try { doc.addImage(img, 'JPEG', M, y, imgW, imgH); } catch { /* skip bad image */ }
      }
      if (p.caption) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...GRAY);
        const capLines = doc.splitTextToSize(p.caption, CW - imgW - 12);
        let cy = y + 12;
        capLines.forEach((ln) => { doc.text(ln, M + imgW + 12, cy); cy += 12; });
      }
      y += imgH + 16;
    }
  }

  // ── Still to confirm ──
  if ((recap.open_items || []).length) { heading(isSub ? 'Open questions' : 'Still to confirm'); bullets(recap.open_items); }

  // ── Footer on every page ──
  const pages = doc.getNumberOfPages();
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(...NAVY); doc.rect(0, 772, W, 40, 'F');
    doc.setFontSize(8); doc.setTextColor(...GOLD); doc.setFont('helvetica', 'bold');
    doc.text('AVENSTONE GROUP LLC', M, 788);
    doc.setTextColor(180, 180, 180); doc.setFont('helvetica', 'normal');
    doc.text(`Page ${i} of ${pages}`, W / 2, 788, { align: 'center' });
    doc.text(now, W - M, 788, { align: 'right' });
  }
  return doc;
}
