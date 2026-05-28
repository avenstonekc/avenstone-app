import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET     = "draw-packages";

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

// ── Cover sheet ────────────────────────────────────────────────────────────────

async function generateCoverSheet(
  doc: PDFDocument,
  draw: Record<string, unknown>,
  lineItems: Record<string, unknown>[],
  job: Record<string, unknown>,
  businessName: string,
  businessAddress: string,
  coverNotes: string | null,
): Promise<void> {
  const page = doc.addPage([612, 792]);

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const W      = 512;

  const navy   = rgb(0.102, 0.145, 0.251);
  const gold   = rgb(0.788, 0.659, 0.298);
  const dark   = rgb(0.04,  0.12,  0.27);
  const gray   = rgb(0.6,   0.6,   0.6);
  const lgray  = rgb(0.88,  0.88,  0.88);
  const black  = rgb(0,     0,     0);
  const cream  = rgb(0.961, 0.949, 0.910);

  page.drawRectangle({ x: 0, y: 722, width: 612, height: 70, color: navy });

  page.drawText(businessName, { x: margin, y: 766, size: 18, font: bold, color: gold });

  const drawLabel  = "DRAW REQUEST";
  const drawLabelW = bold.widthOfTextAtSize(drawLabel, 16);
  page.drawText(drawLabel, { x: margin + W - drawLabelW, y: 766, size: 16, font: bold, color: gold });

  const addrText = businessAddress || "Kansas City, MO";
  page.drawText(addrText, { x: margin, y: 748, size: 9, font: regular, color: gold, opacity: 0.75 });

  const drawMeta  = `Draw #${draw.draw_number}  ·  ${fmtDate(draw.created_at as string)}`;
  const drawMetaW = regular.widthOfTextAtSize(drawMeta, 9);
  page.drawText(drawMeta, { x: margin + W - drawMetaW, y: 748, size: 9, font: regular, color: gold, opacity: 0.75 });

  let y = 704;
  page.drawText("Submitted To:", { x: margin,         y, size: 8, font: bold,    color: gray });
  page.drawText("Project:",      { x: margin + W / 2, y, size: 8, font: bold,    color: gray });
  y -= 14;

  page.drawText(String(job.client_name ?? ""), { x: margin,         y, size: 12, font: bold,    color: dark });
  page.drawText(String(job.address    ?? ""), { x: margin + W / 2, y, size: 11, font: regular, color: dark });
  y -= 14;

  if (draw.title) {
    page.drawText(String(draw.title), { x: margin + W / 2, y, size: 9, font: regular, color: gray });
  }
  y -= 10;

  page.drawLine({ start: { x: margin, y }, end: { x: margin + W, y }, thickness: 1, color: lgray });
  y -= 14;

  const descColW = W * 0.65;
  const amtX     = margin + descColW;

  page.drawText("Description", { x: margin, y, size: 8, font: bold, color: gray });
  page.drawText("Amount",      { x: amtX,   y, size: 8, font: bold, color: gray });
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + W, y }, thickness: 0.5, color: lgray });
  y -= 12;

  const BOTTOM_RESERVE = 155;
  let itemsShown = 0;
  const totalItems = lineItems.length;

  for (const li of lineItems) {
    if (y < margin + BOTTOM_RESERVE) break;
    itemsShown++;

    const desc     = String(li.description ?? "");
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

  if (itemsShown < totalItems) {
    const rem = totalItems - itemsShown;
    page.drawText(`  … and ${rem} more item${rem > 1 ? "s" : ""}`, { x: margin, y, size: 8, font: regular, color: gray });
    y -= 12;
  }

  y -= 4;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + W, y }, thickness: 0.5, color: lgray });
  y -= 8;

  const workBilled    = lineItems.reduce((s, li) => s + Number(li.total_with_markup ?? 0), 0);
  const retainage     = Number(draw.retainage_held ?? 0);
  const netDraw       = workBilled - retainage;
  const totLineCount  = retainage > 0 ? 3 : 2;
  const totBoxH       = totLineCount * 18 + 12;
  const totBoxY       = y - totBoxH;
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

  const footerText = `${businessName}  ·  avenstonekc.com  ·  Kansas City, MO`;
  const ftW        = regular.widthOfTextAtSize(footerText, 8);
  page.drawLine({ start: { x: margin, y: margin + 22 }, end: { x: margin + W, y: margin + 22 }, thickness: 0.5, color: lgray });
  page.drawText(footerText, { x: margin + W / 2 - ftW / 2, y: margin + 8, size: 8, font: regular, color: gray });
}

// ── File helpers ───────────────────────────────────────────────────────────────

interface FileRef { id: string; source: "job_file" | "company_file"; }

interface FileDetail {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  mime_type: string;
  storage_path: string;
  storage_bucket: string;
  source: "job_file" | "company_file";
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
  return details.sort((a, b) => {
    return (orderMap.get(`${a.source}:${a.id}`) ?? 999) - (orderMap.get(`${b.source}:${b.id}`) ?? 999);
  });
}

async function fetchBytes(sb: ReturnType<typeof createClient>, bucket: string, path: string): Promise<Uint8Array | null> {
  try {
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 120);
    if (error || !data?.signedUrl) return null;
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch { return null; }
}

// ── Photo grid pages ───────────────────────────────────────────────────────────

const PROOF_ORDER = ["Before", "During", "Install", "Delivery", "After", "CO Condition", "CO Fix", "Other"];

async function addPhotoPages(
  doc: PDFDocument,
  photos: FileDetail[],
  sb: ReturnType<typeof createClient>,
): Promise<void> {
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);

  const navy  = rgb(0.102, 0.145, 0.251);
  const gray  = rgb(0.6,   0.6,   0.6);
  const lgray = rgb(0.88,  0.88,  0.88);

  const margin  = 50;
  const W       = 512;
  const CELL_W  = (W - 8) / 2;   // 252
  const IMG_H   = 290;
  const CAP_H   = 18;
  const ROW_H   = IMG_H + CAP_H; // 308
  const ROW_GAP = 8;

  // Group by subcategory
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

      for (let j = 0; j < chunk.length; j++) {
        const col  = j % 2;
        const row  = Math.floor(j / 2);
        const cellX = margin + col * (CELL_W + 8);
        const imgTopY = gridTop - row * (ROW_H + ROW_GAP);
        const imgBotY = imgTopY - IMG_H;

        const bytes = await fetchBytes(sb, chunk[j].storage_bucket, chunk[j].storage_path);
        if (bytes && bytes.length > 0) {
          try {
            const isMime = (chunk[j].mime_type || "").toLowerCase();
            const img = isMime.includes("png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
            const scaled = img.scaleToFit(CELL_W, IMG_H);
            page.drawImage(img, {
              x: cellX + (CELL_W - scaled.width) / 2,
              y: imgBotY + (IMG_H - scaled.height) / 2,
              width: scaled.width, height: scaled.height,
            });
          } catch {
            page.drawRectangle({ x: cellX, y: imgBotY, width: CELL_W, height: IMG_H, color: rgb(0.95, 0.95, 0.95) });
            page.drawText("(unavailable)", { x: cellX + CELL_W / 2 - 28, y: imgBotY + IMG_H / 2, size: 8, font: regular, color: gray });
          }
        } else {
          page.drawRectangle({ x: cellX, y: imgBotY, width: CELL_W, height: IMG_H, color: rgb(0.95, 0.95, 0.95) });
          page.drawText("(unavailable)", { x: cellX + CELL_W / 2 - 28, y: imgBotY + IMG_H / 2, size: 8, font: regular, color: gray });
        }

        const caption = (chunk[j].name || "").slice(0, 42);
        page.drawText(caption, { x: cellX, y: imgBotY - 12, size: 7, font: regular, color: gray });
      }
    }
  }
}

// ── Document pages ─────────────────────────────────────────────────────────────

async function addDocumentPages(
  doc: PDFDocument,
  documents: FileDetail[],
  sb: ReturnType<typeof createClient>,
): Promise<void> {
  const margin = 50;
  const W      = 512;

  for (const file of documents) {
    const bytes = await fetchBytes(sb, file.storage_bucket, file.storage_path);
    if (!bytes || bytes.length === 0) continue;

    try {
      if (file.mime_type === "application/pdf") {
        const extDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const indices = extDoc.getPageIndices();
        const copied  = await doc.copyPages(extDoc, indices);
        for (const pg of copied) doc.addPage(pg);
      } else if (file.mime_type?.startsWith("image/")) {
        const page  = doc.addPage([612, 792]);
        const isMime = file.mime_type.toLowerCase();
        const img   = isMime.includes("png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const scaled = img.scaleToFit(W, 692);
        page.drawImage(img, {
          x: margin + (W - scaled.width) / 2,
          y: margin + (692 - scaled.height) / 2,
          width: scaled.width, height: scaled.height,
        });
      }
    } catch { /* skip unprocessable file */ }
  }
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

    // Load draw + line items
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

    // Load job + tenant
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

    // Upsert draw_packages row
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

    // Build PDF
    const doc = await PDFDocument.create();

    // 1. Cover sheet
    await generateCoverSheet(
      doc,
      draw as Record<string, unknown>,
      (lineItems || []) as Record<string, unknown>[],
      job as Record<string, unknown>,
      businessName,
      businessAddress,
      cover_notes as string | null,
    );

    // 2. Selected files
    if (Array.isArray(file_refs) && file_refs.length > 0) {
      const fileDetails = await loadFileDetails(sb, file_refs);
      const photos    = fileDetails.filter(f => f.category === "Photos");
      const documents = fileDetails.filter(f => f.category !== "Photos");

      if (photos.length > 0) await addPhotoPages(doc, photos, sb);
      if (documents.length > 0) await addDocumentPages(doc, documents, sb);
    }

    const pdfBytes = await doc.save();

    // Upload
    const pdfPath = `${job_id}/${draw_id}/cover.pdf`;
    const { error: uploadErr } = await sb.storage
      .from(BUCKET)
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) throw new Error(`PDF upload failed: ${uploadErr.message}`);

    // Signed URL (1 year)
    const { data: signedData, error: signedErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(pdfPath, 60 * 60 * 24 * 365);
    if (signedErr || !signedData?.signedUrl) throw new Error(`Signed URL failed: ${signedErr?.message ?? "no URL"}`);

    // Update draw_packages
    const now = new Date().toISOString();
    await sb.from("draw_packages").update({
      generated_pdf_path: pdfPath,
      cover_notes:        cover_notes,
      included_file_ids:  file_refs,
      status:             "previewed",
      updated_at:         now,
    }).eq("id", pkgId);

    return json({ ok: true, signed_url: signedData.signedUrl, draw_package_id: pkgId });

  } catch (err: unknown) {
    console.error("build-draw-package error:", err);
    return json({ ok: false, error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
