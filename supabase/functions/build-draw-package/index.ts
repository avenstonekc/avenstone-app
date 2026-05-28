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

async function generateCoverSheet(
  draw: Record<string, unknown>,
  lineItems: Record<string, unknown>[],
  job: Record<string, unknown>,
  businessName: string,
  businessAddress: string,
  coverNotes: string | null,
): Promise<Uint8Array> {
  const doc  = await PDFDocument.create();
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

  // Header band
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

  // Bill-to + draw details
  let y = 704;
  page.drawText("Submitted To:", { x: margin,          y, size: 8, font: bold, color: gray });
  page.drawText("Project:",      { x: margin + W / 2,  y, size: 8, font: bold, color: gray });
  y -= 14;

  page.drawText(String(job.client_name ?? ""), { x: margin,         y, size: 12, font: bold,    color: dark });
  page.drawText(String(job.address    ?? ""), { x: margin + W / 2, y, size: 11, font: regular, color: dark });
  y -= 14;

  if (draw.title) {
    page.drawText(String(draw.title), { x: margin + W / 2, y, size: 9, font: regular, color: gray });
  }
  y -= 10;

  // Rule
  page.drawLine({ start: { x: margin, y }, end: { x: margin + W, y }, thickness: 1, color: lgray });
  y -= 14;

  // Line items table header
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

    const desc    = String(li.description ?? "");
    const amt     = Number(li.total_with_markup ?? 0);
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

  // Totals summary
  const workBilled = lineItems.reduce((s, li) => s + Number(li.total_with_markup ?? 0), 0);
  const retainage  = Number(draw.retainage_held ?? 0);
  const netDraw    = workBilled - retainage;

  const totLineCount = retainage > 0 ? 3 : 2;
  const totBoxH      = totLineCount * 18 + 12;
  const totBoxY      = y - totBoxH;
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
  if (retainage > 0) {
    drawTot("Less Retainage Held:", retainage, 9, regular, gray);
  }
  ty -= 2;
  page.drawLine({ start: { x: totLabelX - 4, y: ty + 4 }, end: { x: margin + W, y: ty + 4 }, thickness: 0.5, color: lgray });
  ty -= 4;
  drawTot("NET DRAW REQUEST:", netDraw, 11, bold, navy);

  y = totBoxY - 14;

  // Notes
  if (coverNotes && y > margin + 50) {
    page.drawText("Notes:", { x: margin, y, size: 9, font: bold, color: gray });
    y -= 13;
    for (const line of coverNotes.split("\n").slice(0, 5)) {
      if (y < margin + 40) break;
      page.drawText(line.slice(0, 85), { x: margin, y, size: 8.5, font: regular, color: dark });
      y -= 12;
    }
  }

  // Footer
  const footerText = `${businessName}  ·  avenstonekc.com  ·  Kansas City, MO`;
  const ftW        = regular.widthOfTextAtSize(footerText, 8);
  page.drawLine({ start: { x: margin, y: margin + 22 }, end: { x: margin + W, y: margin + 22 }, thickness: 0.5, color: lgray });
  page.drawText(footerText, { x: margin + W / 2 - ftW / 2, y: margin + 8, size: 8, font: regular, color: gray });

  return doc.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ ok: false, error: "Unauthenticated" }, 401);

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return json({ ok: false, error: "Unauthenticated" }, 401);

    const { draw_id, job_id, cover_notes = null } = await req.json();
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
        .insert({
          tenant_id:     job.tenant_id,
          job_id,
          draw_id,
          status:        "draft",
          created_by_id: user.id,
        })
        .select("id")
        .single();
      if (pkgErr || !newPkg) return json({ ok: false, error: `draw_packages insert failed: ${pkgErr?.message}` }, 500);
      pkgId = newPkg.id as string;
    }

    const pdfBytes = await generateCoverSheet(
      draw as Record<string, unknown>,
      (lineItems || []) as Record<string, unknown>[],
      job as Record<string, unknown>,
      businessName,
      businessAddress,
      cover_notes as string | null,
    );

    const pdfPath = `${job_id}/${draw_id}/cover.pdf`;
    const { error: uploadErr } = await sb.storage
      .from(BUCKET)
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) throw new Error(`PDF upload failed: ${uploadErr.message}`);

    const { data: signedData, error: signedErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(pdfPath, 60 * 60 * 24 * 365);
    if (signedErr || !signedData?.signedUrl) throw new Error(`Signed URL failed: ${signedErr?.message ?? "no URL"}`);

    const now = new Date().toISOString();
    await sb.from("draw_packages").update({
      generated_pdf_path: pdfPath,
      cover_notes:        cover_notes,
      status:             "previewed",
      updated_at:         now,
    }).eq("id", pkgId);

    return json({ ok: true, signed_url: signedData.signedUrl, draw_package_id: pkgId });

  } catch (err: unknown) {
    console.error("build-draw-package error:", err);
    return json({ ok: false, error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
