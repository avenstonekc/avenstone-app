import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET     = "draw-packages";

// ── Logo — JPEG, decoded ONCE at isolate startup ──────────────────────────────
// CRITICAL: this MUST be a JPEG, never a PNG. pdf-lib@1.17.1 embedPng() on an
// RGBA (alpha) PNG triggers a pathological pure-JS alpha→SMask decode that OOMs
// the Supabase edge worker (WORKER_RESOURCE_LIMIT) even with 0 receipts — this
// was the repeat root cause (logo removed at 60e78aa, re-broke at d94fa7c).
// embedJpg() only parses the JPEG header (no pixel decode) so it is memory-safe.
// The navy header-bar colour is baked into the JPEG matte (no transparency needed).
// Verified in-runtime: embedJpg ~350ms vs embedPng OOM ~3.1s.
const LOGO_JPG_B64 = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAgMDAwMDBAcFBAQEBAkGBwUHCgkLCwoJCgoMDREODAwQDAoKDhQPEBESExMTCw4UFhQSFhESExL/2wBDAQMDAwQEBAgFBQgSDAoMEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhL/wAARCAE2AlgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD4Mooor6g8oKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoor0xf2bfiO3wj/4WYvhbUD4PEm37btG7y/+e/l/f8nPHmY2570nJLdgk3seZ0UUUwCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKciNI6rGpZmOFUD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1nc2ltdXEVre7PtMCSsqTbDld6g4bBJIz0qtRRTA6zSvi3450LwxL4b0Pxn4s07w7PHLFLpFprVxDaSJLnzFaFXCENuO4Ec5Oc5rk6KKSSQXJZ7ma6KG5lklMaLGhdy21VGAoz0AHAFOt724tEuEtZ5oUuovKnWOQqJU3BtrAdV3KpweMqD2qCimBreGPFmueCdXj1XwbrOq6DqkSskd7pl7JazIrDDASIQwBHB55qz4v+IHij4g3cF14+8Sa/4lubWMxQTaxqU148SE5Kq0jMQM84FYFFKyvcLsme9uJLSK1knme1gd5IoGkJSNnCh2VegJCLkjrtHoKl0nVr7QdTtdS0K9u9O1GxlWa1u7SZoZYJFOVdHUgqwPIIORVSimB0fjH4k+LviI1o3xA8U+I/EzWAcWp1jVZr0wB8btnmM23O1c467R6VlaJrmpeGtVttU8OahfaVqdlJ5lte2Vw0E0D/3kdSGU+4NUaKSSSsFzofGHxD8VfEK4t5/H3ibxB4lns0KW8usanNetCpOSqGRmKgnnArnqKKEktgO28O/HH4j+ENKh0zwn8QPG2iabbgiGz07xBdW0MeTk7URwo5JPA71zXiHxJq3i7WLjVvFeqajrWq3ZBuL7ULp7meYhQo3SOSzYUADJ6ACs6ihRSd7Bdlm41G7urW1tbq6uJrayVltYZJWZIAzFmCKThQWJJx1JzVaiimB2lj8bPiJpnhweH9N8e+NLTQFt2thpUGv3MdqIWBDR+SH2bCCcrjBya4uiikklsF2ST3Et04e5lkldUVAzsWIVVCquT2CgADsABUdFFMAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/9k=";
const LOGO_JPG_BYTES: Uint8Array | null = (() => {
  try {
    const bin = atob(LOGO_JPG_B64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  } catch { return null; }
})();

// Strip characters outside WinAnsi range to prevent pdf-lib encoding crash.
// Covers tab/LF/CR, printable ASCII (0x20-0x7E), Latin-1 supplement (0xA0-0xFF).
// Strips emoji, U+FFFD replacement char, and anything else above 0xFF.
const safe = (s: unknown): string =>
  (s == null ? '' : String(s)).replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fmtCurrency = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const dt = new Date(d.includes("T") ? d : d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

// ── Cover sheet (multi-page) ────────────────────────────────────────────────────

async function generateCoverSheet(
  doc: PDFDocument,
  draw: Record<string, unknown>,
  lineItems: Record<string, unknown>[],
  job: Record<string, unknown>,
  businessName: string,
  businessAddress: string,
  coverNotes: string | null,
): Promise<void> {
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin    = 50;
  const W         = 512;
  const navy      = rgb(0.102, 0.145, 0.251);
  const gold      = rgb(0.788, 0.659, 0.298);
  const dark      = rgb(0.04,  0.12,  0.27);
  const gray      = rgb(0.6,   0.6,   0.6);
  const lgray     = rgb(0.88,  0.88,  0.88);
  const black     = rgb(0,     0,     0);
  const cream     = rgb(0.961, 0.949, 0.910);
  const descColW  = W * 0.65;
  const amtX      = margin + descColW;

  // Sanitize user-supplied text (module-level safe() strips non-WinAnsi chars)
  const safeName   = safe(businessName);
  const safeAddr   = safe(businessAddress || "Kansas City, MO");
  const safeTitle  = safe(draw.title as string);
  const safeClient = safe(job.client_name as string);
  const safeJobAddr = safe(job.address as string);

  // Logo rendering removed 2026-06-25: the JPEG embed is memory-safe (see LOGO_JPG_BYTES
  // above) but placement overlapped the city tagline in the navy header. Proper logo layout
  // is parked in PDF_BRANDING arc — solve once across all PDF surfaces in a design pass.

  // Space needed on the last page for the total box + footer
  const retainage   = Number(draw.retainage_held ?? 0);
  const totLineCount = retainage > 0 ? 3 : 2;
  const totBoxH     = totLineCount * 18 + 12;
  const MIN_BOTTOM  = margin + 30 /* footer */ + totBoxH + 50 /* dividers + breathing room */;

  // ── Page factory ──────────────────────────────────────────────────────────────
  const addPage = (isFirst: boolean): [ReturnType<typeof doc.addPage>, number] => {
    const pg = doc.addPage([612, 792]);
    pg.drawRectangle({ x: 0, y: 722, width: 612, height: 70, color: navy });

    const nameLabel = isFirst ? safeName : `${safeName}  (continued)`;
    pg.drawText(nameLabel, { x: margin, y: 766, size: isFirst ? 18 : 11, font: bold, color: gold });

    const drawLabel  = "DRAW REQUEST";
    const drawLabelW = bold.widthOfTextAtSize(drawLabel, isFirst ? 16 : 11);
    pg.drawText(drawLabel, { x: margin + W - drawLabelW, y: 766, size: isFirst ? 16 : 11, font: bold, color: gold });

    pg.drawText(safeAddr, { x: margin, y: 748, size: 9, font: regular, color: gold, opacity: 0.75 });
    const drawMeta  = `Draw #${draw.draw_number}  ·  ${fmtDate(draw.created_at as string)}`;
    const drawMetaW = regular.widthOfTextAtSize(drawMeta, 9);
    pg.drawText(drawMeta, { x: margin + W - drawMetaW, y: 748, size: 9, font: regular, color: gold, opacity: 0.75 });

    let y = 704;
    if (isFirst) {
      pg.drawText("Submitted To:", { x: margin,         y, size: 8, font: bold,    color: gray });
      pg.drawText("Project:",      { x: margin + W / 2, y, size: 8, font: bold,    color: gray });
      y -= 14;
      pg.drawText(safeClient, { x: margin,         y, size: 12, font: bold,    color: dark });
      pg.drawText(safeJobAddr, { x: margin + W / 2, y, size: 11, font: regular, color: dark });
      y -= 14;
      if (safeTitle) {
        pg.drawText(safeTitle, { x: margin + W / 2, y, size: 9, font: regular, color: gray });
      }
      y -= 10;
    }

    pg.drawLine({ start: { x: margin, y }, end: { x: margin + W, y }, thickness: 1, color: lgray });
    y -= 14;
    pg.drawText("Description", { x: margin, y, size: 8, font: bold, color: gray });
    pg.drawText("Amount",      { x: amtX,   y, size: 8, font: bold, color: gray });
    y -= 6;
    pg.drawLine({ start: { x: margin, y }, end: { x: margin + W, y }, thickness: 0.5, color: lgray });
    y -= 12;

    return [pg, y];
  };

  const drawFooter = (pg: ReturnType<typeof doc.addPage>) => {
    const footerText = `${safeName}  ·  avenstonekc.com  ·  Kansas City, MO`;
    const ftW = regular.widthOfTextAtSize(footerText, 8);
    pg.drawLine({ start: { x: margin, y: margin + 22 }, end: { x: margin + W, y: margin + 22 }, thickness: 0.5, color: lgray });
    pg.drawText(footerText, { x: margin + W / 2 - ftW / 2, y: margin + 8, size: 8, font: regular, color: gray });
  };

  // ── Item loop — flows across pages ────────────────────────────────────────────
  let [page, y] = addPage(true);

  for (const li of lineItems) {
    if (y < MIN_BOTTOM) {
      drawFooter(page);
      [page, y] = addPage(false);
    }

    const desc     = safe(li.description);
    const amt      = Number(li.total_with_markup ?? 0);
    const maxDescW = descColW - 8;

    let disp = desc;
    while (disp.length > 4 && regular.widthOfTextAtSize(disp, 8.5) > maxDescW) {
      disp = disp.slice(0, -1);
    }
    if (disp !== desc) disp += "…";

    page.drawText(disp, { x: margin, y, size: 8.5, font: regular, color: black });
    const amtStr = fmtCurrency(amt);
    const amtW   = regular.widthOfTextAtSize(amtStr, 8.5);
    page.drawText(amtStr, { x: margin + W - amtW, y, size: 8.5, font: regular, color: black });
    y -= 13;
  }

  // ── Total box (always on the final page) ──────────────────────────────────────
  y -= 4;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + W, y }, thickness: 0.5, color: lgray });
  y -= 8;

  const workBilled = lineItems.reduce((s, li) => s + Number(li.total_with_markup ?? 0), 0);
  const netDraw    = workBilled - retainage;
  const totBoxY    = y - totBoxH;
  page.drawRectangle({ x: margin, y: totBoxY, width: W, height: totBoxH, color: cream });

  const totLabelX = margin + W * 0.52;
  let ty = y - 14;

  const drawTot = (label: string, amount: number, sz: number, f: typeof bold, col: typeof black) => {
    page.drawText(label, { x: totLabelX, y: ty, size: sz, font: f, color: col });
    const valStr = fmtCurrency(amount);
    const valW   = f.widthOfTextAtSize(valStr, sz);
    page.drawText(valStr, { x: margin + W - valW, y: ty, size: sz, font: f, color: col });
    ty -= sz + 7;
  };

  drawTot("Work Billed:", workBilled, 9, regular, dark);
  if (retainage > 0) drawTot("Less Retainage Held:", retainage, 9, regular, gray);
  ty -= 2;
  page.drawLine({ start: { x: totLabelX - 4, y: ty + 4 }, end: { x: margin + W, y: ty + 4 }, thickness: 0.5, color: lgray });
  ty -= 4;
  drawTot("NET DRAW REQUEST:", netDraw, 11, bold, navy);

  y = totBoxY - 14;

  if (coverNotes && y > margin + 50) {
    page.drawText("Notes:", { x: margin, y, size: 9, font: bold, color: gray });
    y -= 13;
    for (const line of coverNotes.split("\n").slice(0, 5)) {
      if (y < margin + 40) break;
      page.drawText(line.slice(0, 85), { x: margin, y, size: 8.5, font: regular, color: dark });
      y -= 12;
    }
  }

  drawFooter(page);
}

// ── File helpers ───────────────────────────────────────────────────────────────

interface FileRef {
  id: string;
  source: "job_file" | "company_file";
  amount?: number;
  date?: string;
}

interface FileDetail {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  mime_type: string;
  storage_path: string;
  storage_bucket: string;
  source: "job_file" | "company_file";
  amount?: number;
  date?: string;
}

async function loadFileDetails(sb: ReturnType<typeof createClient>, fileRefs: FileRef[]): Promise<FileDetail[]> {
  const jobIds  = fileRefs.filter(f => f.source === "job_file").map(f => f.id);
  const compIds = fileRefs.filter(f => f.source === "company_file").map(f => f.id);
  const details: FileDetail[] = [];

  if (jobIds.length > 0) {
    const { data } = await sb.from("job_files")
      .select("id, name, category, subcategory, mime_type, storage_path, storage_bucket")
      .in("id", jobIds);
    for (const f of (data || []) as Record<string, unknown>[]) {
      details.push({
        id: f.id as string, name: (f.name as string) || "",
        category: (f.category as string) || "", subcategory: f.subcategory as string | null,
        mime_type: (f.mime_type as string) || "", storage_path: f.storage_path as string,
        storage_bucket: (f.storage_bucket as string) || "job-files", source: "job_file",
      });
    }
  }

  if (compIds.length > 0) {
    const { data } = await sb.from("company_files")
      .select("id, name, category, type, mime_type, storage_path, storage_bucket")
      .in("id", compIds);
    for (const f of (data || []) as Record<string, unknown>[]) {
      details.push({
        id: f.id as string, name: (f.name as string) || "",
        category: (f.category as string) || "", subcategory: (f.type as string) || null,
        mime_type: (f.mime_type as string) || "", storage_path: f.storage_path as string,
        storage_bucket: (f.storage_bucket as string) || "company-files", source: "company_file",
      });
    }
  }

  const orderMap = new Map(fileRefs.map((f, i) => [`${f.source}:${f.id}`, i]));
  return details.sort((a, b) =>
    (orderMap.get(`${a.source}:${a.id}`) ?? 999) - (orderMap.get(`${b.source}:${b.id}`) ?? 999)
  );
}

// quality 90 + resize:contain prevents imgproxy center-crop on non-square images
async function fetchBytes(
  sb: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  isImage = false,
): Promise<Uint8Array | null> {
  try {
    const opts = isImage
      ? { transform: { width: 1200, quality: 90, resize: "contain" as const } }
      : undefined;
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 120, opts);
    if (error || !data?.signedUrl) return null;
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch { return null; }
}

// Robustness fallback: ask Supabase's imgproxy to transcode + flatten to a baseline JPEG.
// This rescues formats pdf-lib can't embed directly — alpha PNGs (the OOM-guard skips
// embedPng, so they'd otherwise drop), HEIC from iPhones, and webp/gif — by turning them
// into a JPEG that embedJpg always accepts. Only called when a direct embed fails, so it
// never runs on the common (already-JPEG) path.
async function fetchImageJpeg(
  sb: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
): Promise<Uint8Array | null> {
  try {
    // `format: 'jpeg'` forces transcode (flattens alpha); cast around the SDK's narrower type.
    // deno-lint-ignore no-explicit-any
    const opts = { transform: { width: 1600, quality: 85, resize: "contain", format: "jpeg" } } as any;
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 120, opts);
    if (error || !data?.signedUrl) return null;
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length ? bytes : null;
  } catch { return null; }
}

// PNG colour-type 4/6 carry an alpha channel. pdf-lib@1.17.1 embedPng() builds an
// SMask from that alpha via a pure-JS decode that OOMs the edge worker — and the
// OOM kills the isolate, so the surrounding try/catch CANNOT catch it. Detect alpha
// from the IHDR and never feed such a PNG to embedPng (RGB/grayscale PNGs are safe).
function pngHasAlpha(bytes: Uint8Array): boolean {
  if (bytes.length < 26) return false;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47) return false; // not PNG
  const colorType = bytes[25]; // IHDR colour-type byte
  return colorType === 4 || colorType === 6;
}

// Try JPEG first (handles HEIC→JPEG from imgproxy), fall back to PNG.
// embedPng is only ever attempted on alpha-free PNGs (see pngHasAlpha) to avoid OOM.
async function embedImage(doc: PDFDocument, bytes: Uint8Array, preferPng: boolean) {
  const pngSafe = !pngHasAlpha(bytes);
  if (preferPng) {
    if (pngSafe) { try { return await doc.embedPng(bytes); } catch { /* fall through */ } }
    try { return await doc.embedJpg(bytes); } catch { return null; }
  } else {
    try { return await doc.embedJpg(bytes); } catch { /* fall through */ }
    if (pngSafe) { try { return await doc.embedPng(bytes); } catch { return null; } }
    return null;
  }
}

// ── Photo grid pages ───────────────────────────────────────────────────────────

const PROOF_ORDER = ["Before", "During", "Install", "Delivery", "After", "CO Condition", "CO Fix", "Other"];

async function addPhotoPages(
  doc: PDFDocument,
  photos: FileDetail[],
  sb: ReturnType<typeof createClient>,
): Promise<number> {
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);
  let embedded = 0; // photos successfully drawn

  const navy  = rgb(0.102, 0.145, 0.251);
  const gray  = rgb(0.6,   0.6,   0.6);
  const lgray = rgb(0.88,  0.88,  0.88);

  const margin  = 50;
  const W       = 512;
  const CELL_W  = (W - 8) / 2;
  const IMG_H   = 290;
  const CAP_H   = 18;
  const ROW_H   = IMG_H + CAP_H;
  const ROW_GAP = 8;

  const groups: Record<string, FileDetail[]> = {};
  for (const p of photos) {
    const key = p.subcategory || "Other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const ai = PROOF_ORDER.indexOf(a); const bi = PROOF_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const key of sortedKeys) {
    const groupPhotos = groups[key];
    for (let i = 0; i < groupPhotos.length; i += 4) {
      const chunk = groupPhotos.slice(i, i + 4);
      const page  = doc.addPage([612, 792]);

      const headerLabel = i === 0
        ? `${key.toUpperCase()} PHOTOS  (${groupPhotos.length})`
        : `${key.toUpperCase()} PHOTOS  (continued)`;
      page.drawText(headerLabel, { x: margin, y: 762, size: 11, font: bold, color: navy });
      page.drawLine({ start: { x: margin, y: 748 }, end: { x: margin + W, y: 748 }, thickness: 0.5, color: lgray });

      const gridTop = 738;

      const chunkBytes = await Promise.all(
        chunk.map(f => fetchBytes(sb, f.storage_bucket, f.storage_path, true))
      );

      for (let j = 0; j < chunk.length; j++) {
        const col     = j % 2;
        const row     = Math.floor(j / 2);
        const cellX   = margin + col * (CELL_W + 8);
        const imgTopY = gridTop - row * (ROW_H + ROW_GAP);
        const imgBotY = imgTopY - IMG_H;

        const bytes = chunkBytes[j];
        if (bytes && bytes.length > 0) {
          const isMime = (chunk[j].mime_type || "").toLowerCase();
          let img = await embedImage(doc, bytes, isMime.includes("png"));
          // Same rescue as the documents branch: alpha PNG / HEIC / webp → transcode to flat JPEG.
          if (!img) {
            const norm = await fetchImageJpeg(sb, chunk[j].storage_bucket, chunk[j].storage_path);
            if (norm) img = await embedImage(doc, norm, false);
          }
          if (img) {
            const scaled = img.scaleToFit(CELL_W, IMG_H);
            page.drawImage(img, {
              x: cellX + (CELL_W - scaled.width) / 2,
              y: imgBotY + (IMG_H - scaled.height) / 2,
              width: scaled.width, height: scaled.height,
            });
            embedded++;
          } else {
            page.drawRectangle({ x: cellX, y: imgBotY, width: CELL_W, height: IMG_H, color: rgb(0.95, 0.95, 0.95) });
            page.drawText("(unavailable)", { x: cellX + CELL_W / 2 - 28, y: imgBotY + IMG_H / 2, size: 8, font: regular, color: gray });
          }
        } else {
          page.drawRectangle({ x: cellX, y: imgBotY, width: CELL_W, height: IMG_H, color: rgb(0.95, 0.95, 0.95) });
          page.drawText("(unavailable)", { x: cellX + CELL_W / 2 - 28, y: imgBotY + IMG_H / 2, size: 8, font: regular, color: gray });
        }

        const caption = safe(chunk[j].name || "").slice(0, 42);
        page.drawText(caption, { x: cellX, y: imgBotY - 12, size: 7, font: regular, color: gray });
      }
    }
  }
  return embedded;
}

// ── Document pages ─────────────────────────────────────────────────────────────

async function addDocumentPages(
  doc: PDFDocument,
  documents: FileDetail[],
  sb: ReturnType<typeof createClient>,
): Promise<{ embedded: number; placeholdered: number; unrenderable: { id: string; name: string; mime_type: string }[] }> {
  const margin = 50;
  const W      = 512;
  let embedded = 0;      // source documents that produced at least one real page
  let placeholdered = 0; // documents that couldn't be embedded → labeled placeholder page
  const unrenderable: { id: string; name: string; mime_type: string }[] = [];

  // Fonts + colours embedded ONCE (was re-embedding per image page in the old loop).
  const hFont    = await doc.embedFont(StandardFonts.Helvetica);
  const hBold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy     = rgb(0.102, 0.145, 0.251);
  const gold     = rgb(0.788, 0.659, 0.298);
  const white    = rgb(1, 1, 1);
  const HEADER_H = 36;
  const headerY  = 792 - HEADER_H;

  // Navy header band with the file's name + (date · amount) — shared by real pages and placeholders
  // so a placeholder still reads like a real receipt entry in the package.
  const drawDocHeader = (page: ReturnType<PDFDocument["addPage"]>, file: FileDetail) => {
    page.drawRectangle({ x: 0, y: headerY, width: 612, height: HEADER_H, color: navy });
    const label = safe(file.name || "Document").slice(0, 55);
    page.drawText(label, { x: margin, y: headerY + 13, size: 10, font: hBold, color: white });
    const metaParts: string[] = [];
    if (file.date) {
      const d = new Date(file.date + "T00:00:00");
      metaParts.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
    }
    if (file.amount != null) metaParts.push(fmtCurrency(file.amount));
    if (metaParts.length > 0) {
      const metaStr = metaParts.join("  ·  ");
      const metaW   = hFont.widthOfTextAtSize(metaStr, 9);
      page.drawText(metaStr, { x: margin + W - metaW, y: headerY + 14, size: 9, font: hFont, color: gold });
    }
  };

  // NEVER silent: any file we couldn't embed still gets a visible, labeled page saying so —
  // a client-facing package must never drop an attachment without a trace. The original file
  // stays in the job record; this just reports it in the package.
  const drawPlaceholder = (file: FileDetail) => {
    const page = doc.addPage([612, 792]);
    drawDocHeader(page, file);
    const boxH = headerY - margin - 8;
    page.drawRectangle({ x: margin, y: margin, width: W, height: boxH, color: rgb(0.96, 0.96, 0.96), borderColor: rgb(0.82, 0.82, 0.82), borderWidth: 1 });
    const cy = margin + boxH / 2;
    const line1 = "Preview unavailable for this file";
    const line2 = `Type: ${safe(file.mime_type || "unknown")}`;
    const line3 = "The original is attached in the job's file record.";
    const cw = (t: string, s: number, f = hFont) => 306 - f.widthOfTextAtSize(t, s) / 2;
    page.drawText(line1, { x: cw(line1, 13, hBold), y: cy + 14, size: 13, font: hBold, color: rgb(0.42, 0.42, 0.42) });
    page.drawText(line2, { x: cw(line2, 10), y: cy - 6,  size: 10, font: hFont, color: rgb(0.5, 0.5, 0.5) });
    page.drawText(line3, { x: cw(line3, 9),  y: cy - 26, size: 9,  font: hFont, color: rgb(0.55, 0.55, 0.55) });
    placeholdered++;
    unrenderable.push({ id: file.id, name: file.name || "", mime_type: file.mime_type || "" });
    console.warn(`[build-draw-package] unrenderable → placeholder: ${file.id} (${file.mime_type})`);
  };

  // Sequential, one file resident at a time (memory-safe: scanned PDFs / phone photos can be
  // multi-MB). Every file resolves to exactly one of three outcomes — embedded PDF pages,
  // an embedded image page, or a labeled placeholder — so nothing can silently disappear.
  const isPdfBytes = (b: Uint8Array | null) =>
    !!b && b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

  for (const file of documents) {
    const ext = (file.storage_path?.split(".").pop() || "").toLowerCase();
    const isPdfCandidate = ext === "pdf" || file.mime_type === "application/pdf";
    let done = false;

    try {
      // Primary fetch: PDF candidates raw (imgproxy would corrupt them and copyPages needs them
      // intact); everything else downsized (memory-bounded, and imgproxy transcodes HEIC→JPEG).
      const primary = await fetchBytes(sb, file.storage_bucket, file.storage_path, !isPdfCandidate);

      // MAGIC BYTES are the final arbiter over mime/ext (a %PDF is a PDF whatever the label says).
      if (isPdfBytes(primary)) {
        const extDoc = await PDFDocument.load(primary!, { ignoreEncryption: true });
        const copied = await doc.copyPages(extDoc, extDoc.getPageIndices());
        for (const pg of copied) doc.addPage(pg);
        embedded++; done = true;
      } else {
        // Image path. Try the bytes we have as-is (real JPEG/PNG embed straight through).
        const preferPng = ext === "png" || (file.mime_type || "").toLowerCase().includes("png");
        let img = primary && primary.length ? await embedImage(doc, primary, preferPng) : null;

        // Fallbacks only on failure (keeps the common path a single downsized fetch):
        if (!img) {
          // (a) A PDF mislabeled with an image mime AND non-.pdf ext skips the raw fetch above;
          //     re-fetch raw and re-check magic bytes.
          const raw = isPdfCandidate ? primary : await fetchBytes(sb, file.storage_bucket, file.storage_path, false);
          if (isPdfBytes(raw)) {
            const extDoc = await PDFDocument.load(raw!, { ignoreEncryption: true });
            const copied = await doc.copyPages(extDoc, extDoc.getPageIndices());
            for (const pg of copied) doc.addPage(pg);
            embedded++; done = true;
          } else {
            // (b) Unembeddable image (alpha PNG, HEIC, webp, or corrupt transform) → transcode to
            //     a flat JPEG via imgproxy and retry. This is what rescues the alpha-PNG receipts.
            const norm = await fetchImageJpeg(sb, file.storage_bucket, file.storage_path);
            if (norm) img = await embedImage(doc, norm, false);
            if (!img && raw && raw !== primary) img = await embedImage(doc, raw, preferPng);
          }
        }

        if (!done && img) {
          const page = doc.addPage([612, 792]);
          drawDocHeader(page, file);
          const imgAreaH = headerY - margin;
          const scaled   = img.scaleToFit(W, imgAreaH);
          page.drawImage(img, {
            x: margin + (W - scaled.width) / 2,
            y: margin + (imgAreaH - scaled.height) / 2,
            width: scaled.width, height: scaled.height,
          });
          embedded++; done = true;
        }
      }
    } catch (e) {
      console.warn(`[build-draw-package] embed error ${file.id} (${file.mime_type}/${ext}):`, (e as Error).message);
    }

    if (!done) drawPlaceholder(file); // guaranteed page — never a silent drop
  }
  return { embedded, placeholdered, unrenderable };
}

// ── Handler ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ ok: false, error: "Unauthenticated" }, 401);

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return json({ ok: false, error: "Unauthenticated" }, 401);

    const body = await req.json();
    const { draw_id, job_id, cover_notes = null, file_refs = [] } = body as {
      draw_id: string; job_id: string; cover_notes?: string | null; file_refs?: FileRef[];
    };
    if (!draw_id || !job_id) return json({ ok: false, error: "draw_id and job_id required" }, 400);

    const { data: draw, error: drawErr } = await sb
      .from("draw_schedules")
      .select("id, draw_number, title, target_amount, retainage_held, created_at")
      .eq("id", draw_id)
      .single();
    if (drawErr || !draw) return json({ ok: false, error: "Draw not found" }, 404);

    const { data: lineItems } = await sb
      .from("draw_line_items")
      .select("description, base_amount, markup_pct, markup_amount, total_with_markup, display_order")
      .eq("draw_id", draw_id)
      .order("display_order", { ascending: true });

    const { data: job, error: jobErr } = await sb
      .from("jobs")
      .select("id, address, client_name, tenant_id")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) return json({ ok: false, error: "Job not found" }, 404);

    const { data: tenant } = await sb
      .from("tenants")
      .select("name, business_address")
      .eq("id", job.tenant_id as string)
      .single();
    const businessName    = (tenant?.name             as string) || "Avenstone Group";
    const businessAddress = (tenant?.business_address as string) || "Kansas City, MO";

    const { data: existingPkg } = await sb
      .from("draw_packages")
      .select("id")
      .eq("draw_id", draw_id)
      .eq("job_id", job_id)
      .maybeSingle();

    let pkgId: string;
    if (existingPkg?.id) {
      pkgId = existingPkg.id as string;
    } else {
      const { data: newPkg, error: pkgErr } = await sb
        .from("draw_packages")
        .insert({ tenant_id: job.tenant_id, job_id, draw_id, status: "draft", created_by_id: user.id })
        .select("id")
        .single();
      if (pkgErr || !newPkg) return json({ ok: false, error: `draw_packages insert failed: ${pkgErr?.message}` }, 500);
      pkgId = newPkg.id as string;
    }

    let step = "pdf-init";
    const doc = await PDFDocument.create();

    step = "cover-sheet";
    await generateCoverSheet(
      doc,
      draw as Record<string, unknown>,
      (lineItems || []) as Record<string, unknown>[],
      job as Record<string, unknown>,
      businessName,
      businessAddress,
      cover_notes as string | null,
    );

    step = "load-file-details";
    // Diagnostic counts (DRAW_MULTIFILE): refs received vs files resolved vs pages embedded.
    // A gap between any two localizes the "N checked, 1 lands" drop to a specific stage.
    const embedStats = {
      refs_received: Array.isArray(file_refs) ? file_refs.length : 0,
      files_resolved: 0, photos_found: 0, photos_embedded: 0,
      documents_found: 0, documents_embedded: 0, documents_placeholdered: 0,
      unrenderable: [] as { id: string; name: string; mime_type: string }[],
    };
    if (Array.isArray(file_refs) && file_refs.length > 0) {
      const refMeta = new Map(file_refs.map(r => [`${r.source}:${r.id}`, r]));
      const fileDetails = (await loadFileDetails(sb, file_refs)).map(d => {
        const ref = refMeta.get(`${d.source}:${d.id}`);
        return ref ? { ...d, amount: ref.amount, date: ref.date } : d;
      });
      const photos    = fileDetails.filter(f => f.category === "Photos");
      const documents = fileDetails.filter(f => f.category !== "Photos");
      embedStats.files_resolved  = fileDetails.length;
      embedStats.photos_found    = photos.length;
      embedStats.documents_found = documents.length;

      step = "photo-pages";
      if (photos.length > 0) embedStats.photos_embedded = await addPhotoPages(doc, photos, sb);
      step = "document-pages";
      if (documents.length > 0) {
        const dr = await addDocumentPages(doc, documents, sb);
        embedStats.documents_embedded      = dr.embedded;
        embedStats.documents_placeholdered = dr.placeholdered;
        embedStats.unrenderable            = dr.unrenderable;
      }
      console.log(`[build-draw-package] embed_stats:`, JSON.stringify(embedStats));
    }

    step = "pdf-save";
    const pdfBytes = await doc.save();

    step = "pdf-upload";
    const pdfPath = `${job_id}/${draw_id}/cover.pdf`;
    const { error: uploadErr } = await sb.storage
      .from(BUCKET)
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) return json({ ok: false, error: `PDF upload failed: ${uploadErr.message}` }, 500);

    step = "signed-url";
    const { data: signedData, error: signedErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(pdfPath, 60 * 60 * 24 * 365);
    if (signedErr || !signedData?.signedUrl) return json({ ok: false, error: `Signed URL failed: ${signedErr?.message ?? "no URL"}` }, 500);

    step = "draw-packages-update";
    const now = new Date().toISOString();
    await sb.from("draw_packages").update({
      generated_pdf_path: pdfPath,
      cover_notes:        cover_notes,
      included_file_ids:  file_refs,
      status:             "previewed",
      updated_at:         now,
    }).eq("id", pkgId);

    return json({ ok: true, signed_url: signedData.signedUrl, draw_package_id: pkgId, embed_stats: embedStats });

  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? "Unexpected error";
    console.error("build-draw-package error:", msg, err);
    return json({ ok: false, error: msg }, 500);
  }
});
