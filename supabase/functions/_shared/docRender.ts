// AGENT_DOCS — reusable letterhead PDF renderer (pdf-lib, Deno edge). Block-based so invoice/waiver/form/letter share one header/footer.

import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

// ── Branding ─────────────────────────────────────────────────────────────────

export interface Branding {
  name: string;
  email: string;
  phone: string;
  address: string;
}

// deno-lint-ignore no-explicit-any
export async function loadBranding(sb: any, tenantId: string): Promise<Branding> {
  const { data } = await sb
    .from("tenants")
    .select("name, business_email, business_phone, business_address")
    .eq("id", tenantId)
    .maybeSingle();

  return {
    name:    data?.name            || "Avenstone Group",
    email:   data?.business_email  || "notifications@avenstonekc.com",
    phone:   data?.business_phone  || "",
    address: data?.business_address || "",
  };
}

// ── Block types ───────────────────────────────────────────────────────────────

export type DocBlock =
  | { kind: "meta";      rows: string[] }
  | { kind: "twoCol";    left: { label: string; value: string }; right?: { label: string; value: string } }
  | { kind: "table";     columns: string[]; rows: string[][]; rightAlignLastCol?: boolean }
  | { kind: "totals";    rows: { label: string; value: string; bold?: boolean }[] }
  | { kind: "heading";   text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "spacer";    height: number }
  | { kind: "signature"; lines: string[] };

// ── Renderer ──────────────────────────────────────────────────────────────────

export async function renderLetterheadPdf(opts: {
  branding: Branding;
  title?: string;
  blocks: DocBlock[];
  footer?: string[];
}): Promise<Uint8Array> {
  const { branding, title, blocks, footer } = opts;

  const doc = await PDFDocument.create();

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const margin = 50;
  const W      = 512; // 612 - margin * 2
  const gray   = rgb(0.6,  0.6,  0.6);
  const lgray  = rgb(0.88, 0.88, 0.88);
  const dark   = rgb(0.04, 0.12, 0.27);
  const black  = rgb(0,    0,    0);

  // ── Helper: add a fresh page and return a page reference ──────────────────
  const addFreshPage = () => {
    const p = doc.addPage([612, 792]);
    return p;
  };

  // ── Draw the letterhead header on a given page ────────────────────────────
  const drawHeader = (page: ReturnType<typeof doc.addPage>, metaRows: string[]) => {
    const topY = 792 - margin; // 742

    // Company name
    page.drawText(branding.name, { x: margin, y: topY - 20, size: 22, font: bold, color: dark });

    // Contact lines (address, phone, email) — skip blank
    let contactY = topY - 36;
    if (branding.address) {
      page.drawText(branding.address, { x: margin, y: contactY, size: 9, font: regular, color: gray });
      contactY -= 13;
    }
    if (branding.phone) {
      page.drawText(branding.phone, { x: margin, y: contactY, size: 9, font: regular, color: gray });
      contactY -= 13;
    }
    if (branding.email) {
      page.drawText(branding.email, { x: margin, y: contactY, size: 9, font: regular, color: gray });
    }

    // Title (top-right)
    if (title) {
      const titleW = bold.widthOfTextAtSize(title, 26);
      page.drawText(title, { x: margin + W - titleW, y: topY - 20, size: 26, font: bold, color: dark });
    }

    // Meta rows (right-aligned, below title)
    let metaY = topY - 38;
    for (const line of metaRows) {
      const lw = regular.widthOfTextAtSize(line, 10);
      page.drawText(line, { x: margin + W - lw, y: metaY, size: 10, font: regular, color: black });
      metaY -= 14;
    }

    // Horizontal rule
    const ruleY = topY - 80;
    page.drawLine({
      start: { x: margin, y: ruleY },
      end:   { x: margin + W, y: ruleY },
      thickness: 1,
      color: lgray,
    });

    return ruleY;
  };

  // ── Draw the footer lines on a given page ────────────────────────────────
  const drawFooter = (page: ReturnType<typeof doc.addPage>) => {
    if (!footer || footer.length === 0) return;
    const centerX = margin + W / 2;
    let fy = margin + 20;
    for (const line of footer) {
      const font = oblique;
      const lw = font.widthOfTextAtSize(line, 9);
      page.drawText(line, { x: centerX - lw / 2, y: fy, size: 9, font, color: gray });
      fy -= 12;
    }
  };

  // ── Word-wrap helper ──────────────────────────────────────────────────────
  const wrapText = (text: string, maxWidth: number, size: number): string[] => {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? current + " " + word : word;
      if (regular.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [""];
  };

  // ── Collect meta rows (extracted from blocks before the rule) ────────────
  const metaRows: string[] = [];
  const bodyBlocks: DocBlock[] = [];
  for (const block of blocks) {
    if (block.kind === "meta") {
      metaRows.push(...block.rows);
    } else {
      bodyBlocks.push(block);
    }
  }

  // ── First page ────────────────────────────────────────────────────────────
  let page = addFreshPage();
  drawFooter(page);
  let ruleY = drawHeader(page, metaRows);
  let y = ruleY - 16; // cursor starts just below the rule

  // ── Guard: ensure enough room; if not, start a new page ──────────────────
  const guard = (needed: number) => {
    if (y < margin + 60 + needed) {
      drawFooter(page);
      page = addFreshPage();
      drawFooter(page);
      drawHeader(page, []); // re-draw header sans meta on continuation pages
      y = (792 - margin) - 80 - 16; // just below the rule on the new page
    }
  };

  // ── Render each body block ────────────────────────────────────────────────
  for (const block of bodyBlocks) {
    switch (block.kind) {

      // ── twoCol ─────────────────────────────────────────────────────────────
      case "twoCol": {
        guard(32);
        const { left, right } = block;
        page.drawText(left.label, { x: margin, y, size: 10, font: bold, color: gray });
        if (right) {
          page.drawText(right.label, { x: margin + W / 2, y, size: 10, font: bold, color: gray });
        }
        page.drawText(left.value, { x: margin, y: y - 14, size: 11, font: regular, color: black });
        if (right) {
          page.drawText(right.value, { x: margin + W / 2, y: y - 14, size: 10, font: regular, color: black });
        }
        y -= 32;
        break;
      }

      // ── table ──────────────────────────────────────────────────────────────
      case "table": {
        const { columns, rows: tableRows, rightAlignLastCol } = block;
        const colCount = columns.length;
        // Distribute columns evenly; last col might be right-aligned
        const colWidth = W / colCount;
        const colXs = columns.map((_, i) => margin + i * colWidth);
        const lastColRightX = margin + W;

        guard(20 + tableRows.length * 16);

        // Header row
        for (let ci = 0; ci < colCount; ci++) {
          page.drawText(columns[ci], { x: colXs[ci], y, size: 9, font: bold, color: gray });
        }
        y -= 6;
        page.drawLine({
          start: { x: margin, y },
          end:   { x: margin + W, y },
          thickness: 0.5,
          color: lgray,
        });
        y -= 14;

        // Data rows
        const maxDescW = colCount > 1 ? colWidth * 0.95 : W;
        for (const row of tableRows) {
          guard(16);
          for (let ci = 0; ci < colCount; ci++) {
            let cell = row[ci] ?? "";
            const isLast = ci === colCount - 1;
            const isFirst = ci === 0;

            // Truncate first-column cells that are too wide
            if (isFirst && colCount > 1) {
              while (cell.length > 4 && regular.widthOfTextAtSize(cell, 9.5) > maxDescW) {
                cell = cell.slice(0, -1);
              }
              if (cell !== (row[ci] ?? "")) cell += "…";
            }

            if (isLast && rightAlignLastCol) {
              const cw = regular.widthOfTextAtSize(cell, 9.5);
              page.drawText(cell, { x: lastColRightX - cw, y, size: 9.5, font: regular, color: black });
            } else {
              page.drawText(cell, { x: colXs[ci], y, size: 9.5, font: regular, color: black });
            }
          }
          y -= 16;
        }
        break;
      }

      // ── totals ─────────────────────────────────────────────────────────────
      case "totals": {
        guard(block.rows.length * 18 + 4);

        // Separator line before totals
        page.drawLine({
          start: { x: margin, y: y + 4 },
          end:   { x: margin + W, y: y + 4 },
          thickness: 0.5,
          color: lgray,
        });
        y -= 12;

        const totLabelX = margin + W * 0.72;
        const totRightX = margin + W;

        for (const row of block.rows) {
          guard(18);
          const sz   = row.bold ? 12 : 10;
          const font = row.bold ? bold : regular;
          page.drawText(row.label, { x: totLabelX, y, size: sz, font, color: gray });
          const valW = font.widthOfTextAtSize(row.value, sz);
          page.drawText(row.value, { x: totRightX - valW, y, size: sz, font, color: black });
          y -= sz + 6;
        }
        break;
      }

      // ── heading ────────────────────────────────────────────────────────────
      case "heading": {
        guard(20);
        page.drawText(block.text, { x: margin, y, size: 12, font: bold, color: dark });
        y -= 20;
        break;
      }

      // ── paragraph ─────────────────────────────────────────────────────────
      case "paragraph": {
        const paragraphs = block.text.split("\n");
        for (let pi = 0; pi < paragraphs.length; pi++) {
          const wrappedLines = wrapText(paragraphs[pi], W, 10);
          guard(wrappedLines.length * 14);
          for (const line of wrappedLines) {
            page.drawText(line, { x: margin, y, size: 10, font: regular, color: black });
            y -= 14;
          }
          // 6px gap between paragraphs (except after the last one)
          if (pi < paragraphs.length - 1) {
            y -= 6;
          }
        }
        break;
      }

      // ── spacer ─────────────────────────────────────────────────────────────
      case "spacer": {
        y -= block.height;
        break;
      }

      // ── signature ─────────────────────────────────────────────────────────
      case "signature": {
        guard(block.lines.length * 36);
        for (const line of block.lines) {
          guard(36);
          y -= 28;
          // Signature rule
          page.drawLine({
            start: { x: margin, y: y + 10 },
            end:   { x: margin + 220, y: y + 10 },
            thickness: 0.5,
            color: black,
          });
          // Label below the rule
          page.drawText(line, { x: margin, y: y - 2, size: 9, font: regular, color: gray });
          y -= 10;
        }
        break;
      }

      // meta handled above — no-op here
      case "meta":
        break;
    }
  }

  return doc.save();
}
