// TIME_CLOCK_ARC S2b — fill + e-sign the OFFICIAL IRS W-4 / W-9 AcroForm PDFs.
//
// Field names are IRS machine-generated (topmostSubform[0].Page1[0].f1_05[0] ...). The maps
// below were derived from a calibration rasterization (fill each field with its id, render,
// eyeball which box it lands in) — see the RATE_BOOK-style verification in the slice LOG.
// Values are DRAWN at each field's widget rectangle (not AcroForm setText, which pdf-lib's
// flatten does not reliably rasterize), then the interactive fields are flattened away →
// a static PDF that renders identically in every viewer AND the pdfjs verifier.
//
// The submitted values (incl. the TIN) live ONLY in memory here and in the resulting PDF bytes.
// Nothing is persisted as structured data — the caller uploads the bytes to private storage.
//
// FORM-REVISION ROT: the IRS revs the W-4 every January. When public/irs/fw4.pdf is swapped,
// re-run the calibration and re-verify these field names. (CLAUDE.md + KALIN_QUEUE r.)

import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const INK = rgb(0.08, 0.13, 0.27);
const digits = (s) => String(s || '').replace(/\D/g, '');

// Index fields by their short id suffix (unique within one form), e.g. 'f1_05[0]', 'c1_1[2]'.
function indexFields(form) {
  const by = {};
  for (const f of form.getFields()) {
    const m = f.getName().match(/([cf]\d_\d+\[\d+\])$/);
    if (m) by[m[1]] = f;
  }
  return by;
}
function widget(field, pages) {
  const w = field.acroField.getWidgets()[0];
  const r = w.getRectangle();
  const pi = pages.findIndex(p => p.ref === w.P());
  return pi < 0 ? null : { r, page: pages[pi] };
}
function drawIn(field, pages, font, text, { size, dx = 2 } = {}) {
  if (!field || text == null || text === '') return;
  const wd = widget(field, pages); if (!wd) return;
  const sz = size || Math.min(9, wd.r.height - 3);
  wd.page.drawText(String(text), { x: wd.r.x + dx, y: wd.r.y + wd.r.height / 2 - sz * 0.36, size: sz, font, color: INK });
}
function checkIn(field, pages, font) {
  if (!field) return;
  const wd = widget(field, pages); if (!wd) return;
  const sz = Math.min(9, wd.r.width + 1);
  wd.page.drawText('X', { x: wd.r.x + wd.r.width / 2 - sz * 0.33, y: wd.r.y + wd.r.height / 2 - sz * 0.36, size: sz, font, color: INK });
}
// Draw a comb group's digits spread across its box (SSN/EIN cells).
function drawComb(field, pages, font, str, { size = 9 } = {}) {
  if (!field || !str) return;
  const wd = widget(field, pages); if (!wd) return;
  const step = wd.r.width / str.length;
  for (let i = 0; i < str.length; i++) {
    wd.page.drawText(str[i], { x: wd.r.x + step * i + step / 2 - size * 0.28, y: wd.r.y + wd.r.height / 2 - size * 0.36, size, font, color: INK });
  }
}

const W9_CLASS = { individual: 'c1_1[0]', c_corp: 'c1_1[1]', s_corp: 'c1_1[2]', partnership: 'c1_1[3]', trust: 'c1_1[4]', llc: 'c1_1[5]', other: 'c1_1[6]' };
const W4_STATUS = { single: 'c1_1[0]', mfj: 'c1_1[1]', hoh: 'c1_1[2]' };

// Signature/date draw rects (US-Letter points, origin bottom-left). Calibrated to each form's
// "Sign Here" block from the template text anchors — the label sits BELOW its line, so values
// draw just above the label. W-4: "Employee's signature"/"Date" labels at y≈82, "penalties"
// cert text at y≈116 (band 82–116). W-9: "Signature of U.S. person"/"Date" labels at y≈196–204,
// "…interest and dividends" cert text at y≈219 (tight band 204–219). SIG_YBAND asserts each rect
// lands inside its block (unit-checked). box y is the signature image's BOTTOM.
export const SIG = {
  w4: { sig: { x: 120, y: 88, w: 210, h: 22 }, date: { x: 466, y: 92 } },
  w9: { sig: { x: 96,  y: 205, w: 224, h: 12 }, date: { x: 388, y: 205 } },
};
// [minY, maxY] of each form's Sign Here block — draw rects must fall within.
export const SIG_YBAND = { w4: [78, 118], w9: [194, 220] };

async function embedSignature(doc, page, pngDataUrl, box) {
  if (!pngDataUrl) return;
  const png = await doc.embedPng(pngDataUrl);
  const scale = Math.min(box.w / png.width, box.h / png.height);
  page.drawImage(png, { x: box.x, y: box.y, width: png.width * scale, height: png.height * scale });
}

// ── Public: fill a form → Uint8Array PDF bytes ────────────────────────────────
// docType 'w4'|'w9'; values (see below); signaturePng (dataURL); dateStr 'M/D/YYYY';
// assets = { templateBytes: ArrayBuffer, fontBytes: ArrayBuffer }.
export async function fillPaperwork(docType, values, signaturePng, dateStr, assets) {
  const doc = await PDFDocument.load(assets.templateBytes);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(assets.fontBytes);
  const pages = doc.getPages();
  const form = doc.getForm();
  const F = indexFields(form);

  if (docType === 'w9') {
    drawIn(F['f1_01[0]'], pages, font, values.name);
    if (values.businessName) drawIn(F['f1_02[0]'], pages, font, values.businessName);
    checkIn(F[W9_CLASS[values.classification] || 'c1_1[0]'], pages, font);
    if (values.classification === 'llc' && values.llcType) drawIn(F['f1_03[0]'], pages, font, values.llcType);
    if (values.classification === 'other' && values.otherDesc) drawIn(F['f1_04[0]'], pages, font, values.otherDesc);
    drawIn(F['f1_07[0]'], pages, font, values.address);
    drawIn(F['f1_08[0]'], pages, font, values.cityStateZip);
    const tin = digits(values.tin);
    if (values.tinType === 'ein') {
      drawComb(F['f1_14[0]'], pages, font, tin.slice(0, 2));
      drawComb(F['f1_15[0]'], pages, font, tin.slice(2, 9));
    } else { // SSN 3-2-4
      drawComb(F['f1_11[0]'], pages, font, tin.slice(0, 3));
      drawComb(F['f1_12[0]'], pages, font, tin.slice(3, 5));
      drawComb(F['f1_13[0]'], pages, font, tin.slice(5, 9));
    }
    await embedSignature(doc, pages[0], signaturePng, SIG.w9.sig);
    pages[0].drawText(dateStr, { x: SIG.w9.date.x, y: SIG.w9.date.y, size: 10, font, color: INK });
  } else { // w4 — Steps 1 + 5 required; 2-4 optional passthrough
    drawIn(F['f1_01[0]'], pages, font, values.firstMi);
    drawIn(F['f1_02[0]'], pages, font, values.lastName);
    drawIn(F['f1_03[0]'], pages, font, values.address);
    drawIn(F['f1_04[0]'], pages, font, values.cityStateZip);
    const ssn = digits(values.ssn);
    drawIn(F['f1_05[0]'], pages, font, ssn.length === 9 ? `${ssn.slice(0,3)}-${ssn.slice(3,5)}-${ssn.slice(5)}` : ssn);
    checkIn(F[W4_STATUS[values.filingStatus] || 'c1_1[0]'], pages, font);
    if (values.step2c) checkIn(F['c1_2[0]'], pages, font);
    drawIn(F['f1_06[0]'], pages, font, values.step3_children);
    drawIn(F['f1_07[0]'], pages, font, values.step3_others);
    drawIn(F['f1_08[0]'], pages, font, values.step3_total);
    drawIn(F['f1_09[0]'], pages, font, values.step4a);
    drawIn(F['f1_10[0]'], pages, font, values.step4b);
    drawIn(F['f1_11[0]'], pages, font, values.step4c);
    await embedSignature(doc, pages[0], signaturePng, SIG.w4.sig);
    pages[0].drawText(dateStr, { x: SIG.w4.date.x, y: SIG.w4.date.y, size: 10, font, color: INK });
  }

  try { form.flatten(); } catch { /* fields already static overlays; ignore */ }
  return doc.save();
}
