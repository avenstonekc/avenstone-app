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
