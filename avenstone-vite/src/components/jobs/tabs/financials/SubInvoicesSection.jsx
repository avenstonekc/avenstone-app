/**
 * SUB_INVOICES_ARC Phase 2 — FinancialsTab "Sub Invoices" section.
 *
 * Three views: Pending Review / Outstanding (approved + partially paid) / Paid
 * Detail panel: invoice info + payment history + action buttons
 * AddInvoiceModal: minimal manual entry (Phase 3 adds line items + PDF)
 * AddPaymentModal: record a payment against an existing invoice
 *
 * Role gates: Approve / Add Payment / Dispute / Void Payment — owner+PM only.
 * Sales reps: can create invoices, view only otherwise (buttons hidden).
 */

import { useState, useEffect, useMemo } from 'react';
import { sb, AV_TENANT, AI_EXTRACT_SUB_INVOICE_URL, sbUploadJobFile, sbSignJobFileUrl, sbLoadScheduleItems } from '../../../../lib/supabase';
import {
  sbLoadSubInvoices, sbCreateSubInvoice, sbApproveSubInvoice,
  sbDisputeSubInvoice, sbAddSubInvoicePayment, sbVoidSubInvoicePayment,
} from '../../../../lib/subInvoices';
import { f$, isMob } from '../../../../lib/utils';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG = {
  pending_review:  { bg: '#F3F4F6', color: '#374151',  label: 'Pending Review' },
  approved:        { bg: '#EFF6FF', color: '#1D4ED8',  label: 'Approved' },
  partially_paid:  { bg: '#FEF3C7', color: '#92400E',  label: 'Partial' },
  paid:            { bg: '#D1FAE5', color: '#065F46',  label: 'Paid' },
  disputed:        { bg: '#FEE2E2', color: '#DC2626',  label: '🚩 Disputed' },
  voided:          { bg: '#F3F4F6', color: '#9CA3AF',  label: 'Voided' },
};

const METHOD_LABELS = { check: 'Check', ach: 'ACH', cash: 'Cash', card: 'Card', other: 'Other' };

const isManager = (role) => role === 'owner' || role === 'project_manager';

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending_review;
  return (
    <span style={{ background: cfg.bg, color: cfg.color, fontSize: 10, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 8px', borderRadius: 20,
      whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export default function SubInvoicesSection({ job, profile }) {
  const mob = isMob();
  const userRole = profile?.role;

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState(null);
  const [view, setView]         = useState('pending');   // 'pending' | 'outstanding' | 'paid'
  const [selectedId, setSelectedId] = useState(null);
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [addPaymentFor, setAddPaymentFor]   = useState(null); // invoice object

  const load = async () => {
    setLoading(true);
    setErr(null);
    const res = await sbLoadSubInvoices({ jobId: job.id });
    if (res.ok) {
      setInvoices(res.data || []);
    } else {
      setErr(res.error || 'Failed to load invoices');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [job.id]);

  // Partition into views (voided invoices excluded from all three main buckets)
  const partitioned = useMemo(() => {
    const pending     = invoices.filter(i => i.status === 'pending_review');
    const outstanding = invoices.filter(i => ['approved', 'partially_paid', 'disputed'].includes(i.status));
    const paid        = invoices.filter(i => i.status === 'paid');
    return { pending, outstanding, paid };
  }, [invoices]);

  const apOutstanding = useMemo(() =>
    partitioned.outstanding
      .filter(i => i.status !== 'disputed')
      .reduce((s, i) => s + i.balance, 0),
    [partitioned.outstanding]
  );

  const selectedInvoice = invoices.find(i => i.id === selectedId) || null;

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleApprove = async (inv) => {
    const res = await sbApproveSubInvoice({ subInvoiceId: inv.id });
    if (res.ok) { await load(); }
    else { setErr(res.error || 'Approve failed'); }
  };

  const handleDispute = async (inv) => {
    const reason = window.prompt(`Reason for disputing invoice ${inv.invoiceNumber}?`);
    if (!reason) return;
    const res = await sbDisputeSubInvoice({ subInvoiceId: inv.id, disputed: true, disputeReason: reason });
    if (res.ok) { await load(); }
    else { setErr(res.error || 'Dispute failed'); }
  };

  const handleResolveDispute = async (inv) => {
    const res = await sbDisputeSubInvoice({ subInvoiceId: inv.id, disputed: false });
    if (res.ok) { await load(); }
    else { setErr(res.error || 'Resolve failed'); }
  };

  const handleVoidPayment = async (payment) => {
    const reason = window.prompt('Reason for voiding this payment?');
    if (!reason) return;
    const res = await sbVoidSubInvoicePayment({ paymentId: payment.id, voidReason: reason });
    if (res.ok) { await load(); }
    else { setErr(res.error || 'Void failed'); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const viewList = [
    { id: 'pending',     label: `Pending Review (${partitioned.pending.length})` },
    { id: 'outstanding', label: `Outstanding (${partitioned.outstanding.length})` },
    { id: 'paid',        label: `Paid (${partitioned.paid.length})` },
  ];
  const currentList = partitioned[view] || [];

  return (
    <div>
      {/* Error banner */}
      {err && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#DC2626',
          padding: '8px 12px', fontSize: 12, marginBottom: 12, borderRadius: 4,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {err}
          <button onClick={() => setErr(null)} style={{ background: 'none', border: 'none',
            color: '#DC2626', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1F44' }}>Sub Invoices</div>
          {apOutstanding > 0 && (
            <div style={{ fontSize: 11, color: '#C9A84C', marginTop: 2 }}>
              AP Outstanding: <strong>{f$(apOutstanding)}</strong> across {partitioned.outstanding.filter(i => i.status !== 'disputed').length} invoice{partitioned.outstanding.filter(i => i.status !== 'disputed').length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowAddInvoice(true)}
          style={{ fontSize: 12, padding: '6px 14px', background: '#0A1F44', color: '#C9A84C',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
          + Add Invoice
        </button>
      </div>

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: '2px solid #E8E4DC',
        overflowX: 'auto', flexWrap: 'nowrap' }}>
        {viewList.map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            padding: '6px 12px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: 'none', borderBottom: `2px solid ${view === v.id ? '#C9A84C' : 'transparent'}`,
            marginBottom: -2, color: view === v.id ? '#0A1F44' : '#9CA3AF', whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>{v.label}</button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>
          Loading invoices…
        </div>
      )}

      {/* Empty state */}
      {!loading && currentList.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 16px', background: '#fff',
          border: '1px solid #E8E4DC', borderRadius: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            {view === 'pending' ? 'No invoices pending review' :
             view === 'outstanding' ? 'No outstanding invoices' :
             'No paid invoices yet'}
          </div>
          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
            {view === 'pending'
              ? 'Click + Add Invoice to enter one manually. PDF upload ships in Phase 3.'
              : view === 'outstanding'
              ? 'All invoices are either pending review or fully paid.'
              : 'Paid invoices will appear here once payments are complete.'}
          </div>
        </div>
      )}

      {/* Invoice list */}
      {!loading && currentList.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {currentList.map(inv => (
            <InvoiceRow
              key={inv.id}
              inv={inv}
              selected={selectedId === inv.id}
              onClick={() => setSelectedId(selectedId === inv.id ? null : inv.id)}
            />
          ))}
        </div>
      )}

      {/* Detail panel — opens below selected row inline or as modal on mobile */}
      {selectedInvoice && (
        <InvoiceDetailPanel
          inv={selectedInvoice}
          userRole={userRole}
          onClose={() => setSelectedId(null)}
          onApprove={() => handleApprove(selectedInvoice)}
          onDispute={() => handleDispute(selectedInvoice)}
          onResolveDispute={() => handleResolveDispute(selectedInvoice)}
          onAddPayment={() => setAddPaymentFor(selectedInvoice)}
          onVoidPayment={handleVoidPayment}
          mob={mob}
        />
      )}

      {/* Add Invoice modal */}
      {showAddInvoice && (
        <AddInvoiceModal
          job={job}
          onClose={() => setShowAddInvoice(false)}
          onSaved={() => { setShowAddInvoice(false); load(); }}
        />
      )}

      {/* Add Payment modal */}
      {addPaymentFor && (
        <AddPaymentModal
          inv={addPaymentFor}
          onClose={() => setAddPaymentFor(null)}
          onSaved={() => { setAddPaymentFor(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── InvoiceRow ───────────────────────────────────────────────────────────────

function InvoiceRow({ inv, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? '#F0F4FF' : '#fff',
        border: `1px solid ${selected ? '#1D4ED8' : '#E8E4DC'}`,
        borderRadius: 6, padding: '10px 14px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        transition: 'all 0.12s',
      }}
    >
      <div style={{ flex: 1, minWidth: 120 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', display: 'flex', alignItems: 'center', gap: 6 }}>
          #{inv.invoiceNumber}
          {inv.autoGeneratedNumber && (
            <span title="Auto-generated number" style={{ fontSize: 10, color: '#9CA3AF' }}>🤖</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{inv.subName}</div>
      </div>
      <div style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>{inv.invoiceDate}</div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>{f$(inv.amount)}</div>
        {inv.balance > 0 && inv.status !== 'pending_review' && (
          <div style={{ fontSize: 10, color: '#C9A84C' }}>Balance {f$(inv.balance)}</div>
        )}
      </div>
      <StatusBadge status={inv.status} />
      <div style={{ color: '#9CA3AF', fontSize: 12, flexShrink: 0 }}>{selected ? '▲' : '▼'}</div>
    </div>
  );
}

// ─── InvoiceDetailPanel ───────────────────────────────────────────────────────

function InvoiceDetailPanel({ inv, userRole, onClose, onApprove, onDispute, onResolveDispute, onAddPayment, onVoidPayment, mob }) {
  const canManage = isManager(userRole);
  const nonVoidedPayments = inv.payments.filter(p => !p.voidedAt);
  const overPaid = inv.paidSum > inv.amount;

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0A1F44' }}>
              Invoice #{inv.invoiceNumber}
              {inv.autoGeneratedNumber && <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 6 }}>auto-generated</span>}
            </div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{inv.subName}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={inv.status} />
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20,
              color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Invoice metadata */}
        <div style={{ background: '#F7F5F0', borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              ['Invoice Date', inv.invoiceDate],
              ['Due Date', inv.dueDate || '—'],
              ['Amount', f$(inv.amount)],
              ['Balance', f$(inv.balance)],
            ].map(([lb, val]) => (
              <div key={lb}>
                <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{lb}</div>
                <div style={{ color: '#0A1F44', fontWeight: 600, marginTop: 1 }}>{val}</div>
              </div>
            ))}
          </div>
          {inv.description && (
            <div style={{ marginTop: 8, color: '#374151', borderTop: '1px solid #E8E4DC', paddingTop: 6 }}>
              {inv.description}
            </div>
          )}
          {inv.invoiceFileId && (
            <button
              onClick={async () => {
                const r = await sbSignJobFileUrl(inv.invoiceFileId);
                if (r.ok) window.open(r.url, '_blank');
                else alert('Could not load file: ' + r.error);
              }}
              style={{ marginTop: 6, fontSize: 11, color: '#1D4ED8', background: 'none',
                border: '1px solid #DBEAFE', borderRadius: 4, padding: '3px 8px',
                cursor: 'pointer', display: 'inline-block' }}>
              📎 View Invoice File
            </button>
          )}
          {inv.disputeReason && (
            <div style={{ marginTop: 6, color: '#DC2626', fontSize: 11 }}>🚩 Dispute: {inv.disputeReason}</div>
          )}
          {inv.approvedAt && (
            <div style={{ marginTop: 6, color: '#6B7280', fontSize: 10 }}>
              Approved {new Date(inv.approvedAt).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Line items (if present) */}
        {Array.isArray(inv.lineItems) && inv.lineItems.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase',
              letterSpacing: 1, marginBottom: 6 }}>Line Items</div>
            <div style={{ border: '1px solid #E8E4DC', borderRadius: 4, overflow: 'hidden', fontSize: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr',
                background: '#F7F5F0', padding: '6px 10px', fontWeight: 700, color: '#374151', fontSize: 10 }}>
                {['Description', 'Qty', 'Unit Price', 'Total'].map(h => <div key={h}>{h}</div>)}
              </div>
              {inv.lineItems.map((li, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr',
                  padding: '6px 10px', borderTop: '1px solid #F3F0EB', color: '#374151' }}>
                  <div>{li.description}</div>
                  <div>{li.qty ?? '—'}</div>
                  <div>{li.unit_price != null ? f$(li.unit_price) : '—'}</div>
                  <div style={{ fontWeight: 600 }}>{f$(li.total)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment history */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase',
            letterSpacing: 1, marginBottom: 6 }}>Payment History</div>

          {inv.payments.length === 0 ? (
            <div style={{ color: '#9CA3AF', fontSize: 12, padding: '8px 0' }}>No payments recorded.</div>
          ) : (
            <div style={{ border: '1px solid #E8E4DC', borderRadius: 4, overflow: 'hidden' }}>
              {inv.payments.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  borderBottom: '1px solid #F3F0EB', fontSize: 12,
                  opacity: p.voidedAt ? 0.5 : 1 }}>
                  <div style={{ flex: 1, textDecoration: p.voidedAt ? 'line-through' : 'none', color: '#374151' }}>
                    <span style={{ fontWeight: 600 }}>{f$(p.amount)}</span>
                    <span style={{ color: '#9CA3AF', marginLeft: 6 }}>
                      {METHOD_LABELS[p.method] || p.method}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </span>
                    <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>{p.paidDate}</div>
                  </div>
                  {p.voidedAt ? (
                    <span style={{ fontSize: 10, background: '#F3F4F6', color: '#9CA3AF',
                      padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>VOIDED</span>
                  ) : (
                    canManage && (
                      <button onClick={() => onVoidPayment(p)} style={{
                        fontSize: 11, padding: '3px 8px', background: 'none', border: '1px solid #E8E4DC',
                        borderRadius: 4, cursor: 'pointer', color: '#9CA3AF' }}>Void</button>
                    )
                  )}
                </div>
              ))}
              {/* Totals */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, padding: '8px 10px',
                background: '#F7F5F0', fontSize: 12, fontWeight: 700 }}>
                <span style={{ color: '#374151' }}>Paid: {f$(inv.paidSum)}</span>
                <span style={{ color: inv.balance > 0 ? '#C9A84C' : '#22c55e' }}>
                  {inv.balance > 0 ? `Balance: ${f$(inv.balance)}` : 'Fully Paid'}
                </span>
              </div>
            </div>
          )}

          {/* Overpayment warning */}
          {overPaid && (
            <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E',
              padding: '6px 10px', borderRadius: 4, fontSize: 11, marginTop: 6 }}>
              ⚠️ Overpaid by {f$(inv.paidSum - inv.amount)}
            </div>
          )}
        </div>

        {/* Action buttons (owner/PM only) */}
        {canManage && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {inv.status === 'pending_review' && (
              <button onClick={onApprove} className="btn btn-navy" style={{ fontSize: 12, padding: '7px 16px' }}>
                ✓ Approve
              </button>
            )}
            {(inv.status === 'approved' || inv.status === 'partially_paid') && (
              <button onClick={onAddPayment} className="btn btn-gold" style={{ fontSize: 12, padding: '7px 16px' }}>
                + Add Payment
              </button>
            )}
            {!inv.disputed && inv.status !== 'voided' && inv.status !== 'paid' && (
              <button onClick={onDispute} className="btn btn-ghost" style={{ fontSize: 12, padding: '7px 16px', color: '#DC2626' }}>
                🚩 Dispute
              </button>
            )}
            {inv.disputed && (
              <button onClick={onResolveDispute} className="btn btn-ghost" style={{ fontSize: 12, padding: '7px 16px' }}>
                Resolve Dispute
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AddInvoiceModal ──────────────────────────────────────────────────────────

function AddInvoiceModal({ job, onClose, onSaved }) {
  const TODAY = new Date().toISOString().slice(0, 10);

  const [contacts, setContacts]       = useState([]);
  const [schedItems, setSchedItems]   = useState([]);
  const [lineItems, setLineItems]     = useState([]);
  const [saving, setSaving]           = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [extracting, setExtracting]   = useState(false);
  const [uploadedFileId, setUploadedFileId]     = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState(null);
  const [err, setErr]                 = useState(null);
  const [form, setForm] = useState({
    subContactId:          '',
    invoiceNumber:         '',
    invoiceDate:           TODAY,
    dueDate:               '',
    amount:                '',
    description:           '',
    relatedScheduleItemId: '',
  });

  useEffect(() => {
    sb.from('contacts')
      .select('id, name, type')
      .eq('tenant_id', AV_TENANT)
      .order('name')
      .then(({ data }) => setContacts(data || []));
    sbLoadScheduleItems(job.id).then(res => {
      if (res.ok) setSchedItems(res.data || []);
    });
  }, [job.id]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // ── Line items helpers ────────────────────────────────────────────────────────
  const addLineItem = () => setLineItems(p => [...p, { description: '', qty: '', unit_price: '', total: '' }]);
  const removeLineItem = (i) => setLineItems(p => p.filter((_, idx) => idx !== i));
  const setLineItem = (idx, k, v) => {
    setLineItems(p => {
      const next = [...p];
      next[idx] = { ...next[idx], [k]: v };
      if (k === 'qty' || k === 'unit_price') {
        const qty = parseFloat(k === 'qty' ? v : next[idx].qty) || 0;
        const up  = parseFloat(k === 'unit_price' ? v : next[idx].unit_price) || 0;
        if (qty > 0 && up > 0) next[idx].total = (qty * up).toFixed(2);
      }
      return next;
    });
  };

  // ── File upload + AI extract ──────────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setUploading(true);
    const up = await sbUploadJobFile({
      jobId: job.id,
      file,
      category: 'Documents',
      subcategory: null,
      uploadSource: 'manual',
    });
    setUploading(false);
    if (!up.ok) { setErr(up.error || 'Upload failed'); return; }
    const fileId = up.data.id;
    setUploadedFileId(fileId);
    setUploadedFileName(file.name);

    setExtracting(true);
    try {
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(AI_EXTRACT_SUB_INVOICE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ jobFileId: fileId }),
      });
      const json = await res.json();
      if (json.ok && json.extracted) {
        const x = json.extracted;
        setForm(p => ({
          ...p,
          invoiceNumber: x.invoice_number ?? p.invoiceNumber,
          invoiceDate:   x.invoice_date   ?? p.invoiceDate,
          dueDate:       x.due_date       ?? p.dueDate,
          amount:        x.amount != null ? String(x.amount) : p.amount,
          description:   x.description   ?? p.description,
        }));
        if (Array.isArray(x.line_items) && x.line_items.length > 0) {
          setLineItems(x.line_items.map(li => ({
            description: li.description || '',
            qty:         li.qty        != null ? String(li.qty)        : '',
            unit_price:  li.unit_price != null ? String(li.unit_price) : '',
            total:       li.total      != null ? String(li.total)      : '',
          })));
        }
      }
    } catch (e) {
      console.warn('[AddInvoiceModal] extract failed:', e);
    }
    setExtracting(false);
  };

  // ── Save ──────────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.subContactId) { setErr('Select a sub contact'); return; }
    if (!form.invoiceDate)  { setErr('Invoice date is required'); return; }
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) { setErr('Amount must be greater than 0'); return; }

    const cleanLineItems = lineItems
      .filter(li => li.description.trim())
      .map(li => ({
        description: li.description.trim(),
        qty:         li.qty        ? parseFloat(li.qty)        || null : null,
        unit_price:  li.unit_price ? parseFloat(li.unit_price) || null : null,
        total:       parseFloat(li.total) || 0,
      }));

    setErr(null);
    setSaving(true);
    const res = await sbCreateSubInvoice({
      jobId:                 job.id,
      subContactId:          form.subContactId,
      invoiceNumber:         form.invoiceNumber.trim() || undefined,
      invoiceDate:           form.invoiceDate,
      dueDate:               form.dueDate || undefined,
      amount:                amt,
      description:           form.description.trim() || undefined,
      lineItems:             cleanLineItems.length > 0 ? cleanLineItems : undefined,
      relatedScheduleItemId: form.relatedScheduleItemId || undefined,
      invoiceFileId:         uploadedFileId || undefined,
      submittedVia:          uploadedFileId ? 'pdf_upload' : 'manual_upload',
    });
    setSaving(false);
    if (res.ok) {
      onSaved();
    } else {
      setErr(res.error || 'Save failed');
    }
  };

  const ssty = { appearance: 'none', paddingRight: 28 };
  const inpSty = { border: '1px solid #E8E4DC', borderRadius: 3, padding: '3px 6px',
    fontSize: 12, background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const lineItemTotal = lineItems.reduce((s, li) => s + (parseFloat(li.total) || 0), 0);

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="modal-title" style={{ margin: 0 }}>Add Invoice</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20,
            color: '#9CA3AF', cursor: 'pointer' }}>×</button>
        </div>

        {err && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#DC2626',
            padding: '7px 10px', fontSize: 12, borderRadius: 4, marginBottom: 12 }}>{err}</div>
        )}

        {/* ── File upload + AI extract ── */}
        <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 6,
          padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
            Invoice File <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(optional — PDF or image; fields auto-extracted by AI)</span>
          </div>
          {uploadedFileName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#374151' }}>📎 {uploadedFileName}</span>
              {extracting ? (
                <span style={{ fontSize: 11, color: '#C9A84C' }}>✨ Extracting fields…</span>
              ) : (
                <span style={{ fontSize: 11, color: '#22c55e' }}>✓ Fields pre-filled — review below</span>
              )}
              <button type="button" onClick={() => { setUploadedFileId(null); setUploadedFileName(null); }}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#9CA3AF',
                  cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          ) : uploading ? (
            <div style={{ fontSize: 12, color: '#9CA3AF' }}>Uploading…</div>
          ) : (
            <label style={{ display: 'inline-block', cursor: 'pointer', fontSize: 12, color: '#1D4ED8',
              background: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: 4, padding: '5px 12px' }}>
              📁 Choose file
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileChange}
                style={{ display: 'none' }} />
            </label>
          )}
        </div>

        {/* Sub / Vendor */}
        <div className="fg">
          <label className="flbl">Sub / Vendor *</label>
          <select className="finp" style={ssty} value={form.subContactId} onChange={e => set('subContactId', e.target.value)}>
            <option value="">— Select contact —</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.type ? ` (${c.type})` : ''}</option>
            ))}
          </select>
        </div>

        {/* Invoice # */}
        <div className="fg">
          <label className="flbl">Invoice # <span style={{ color: '#9CA3AF' }}>(leave blank to auto-generate)</span></label>
          <input className="finp" value={form.invoiceNumber}
            onChange={e => set('invoiceNumber', e.target.value)}
            placeholder="e.g. 2024-047" />
        </div>

        {/* Dates — side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="fg">
            <label className="flbl">Invoice Date *</label>
            <input className="finp" type="date" value={form.invoiceDate}
              onChange={e => set('invoiceDate', e.target.value)} />
          </div>
          <div className="fg">
            <label className="flbl">Due Date <span style={{ color: '#9CA3AF' }}>(opt.)</span></label>
            <input className="finp" type="date" value={form.dueDate}
              onChange={e => set('dueDate', e.target.value)} />
          </div>
        </div>

        {/* Amount */}
        <div className="fg">
          <label className="flbl">
            Amount *
            {lineItems.length > 0 && lineItemTotal > 0 && (
              <span style={{ color: '#9CA3AF', fontWeight: 400, marginLeft: 8 }}>
                (line items total: {f$(lineItemTotal)})
              </span>
            )}
          </label>
          <input className="finp" type="number" min="0.01" step="0.01"
            value={form.amount} onChange={e => set('amount', e.target.value)}
            placeholder="0.00" />
        </div>

        {/* Description */}
        <div className="fg">
          <label className="flbl">Description <span style={{ color: '#9CA3AF' }}>(optional)</span></label>
          <textarea className="finp" rows={2} value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="e.g. Framing labor — 142 Oak St" style={{ resize: 'vertical' }} />
        </div>

        {/* ── Line items table ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#374151',
              textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Line Items <span style={{ fontWeight: 400, color: '#9CA3AF', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </div>
            <button type="button" onClick={addLineItem}
              style={{ fontSize: 11, color: '#1D4ED8', background: 'none', border: '1px solid #DBEAFE',
                borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>
              + Add line
            </button>
          </div>
          {lineItems.length > 0 && (
            <div style={{ border: '1px solid #E8E4DC', borderRadius: 4, overflow: 'hidden', fontSize: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr 28px',
                background: '#F7F5F0', padding: '5px 8px', fontWeight: 700, color: '#374151', fontSize: 10 }}>
                {['Description', 'Qty', 'Unit $', 'Total', ''].map((h, i) => <div key={i}>{h}</div>)}
              </div>
              {lineItems.map((li, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr 28px',
                  padding: '4px 8px', borderTop: '1px solid #F3F0EB', gap: 4, alignItems: 'center' }}>
                  <input value={li.description} onChange={e => setLineItem(i, 'description', e.target.value)}
                    placeholder="Description" style={inpSty} />
                  <input value={li.qty} onChange={e => setLineItem(i, 'qty', e.target.value)}
                    type="number" min="0" placeholder="0" style={inpSty} />
                  <input value={li.unit_price} onChange={e => setLineItem(i, 'unit_price', e.target.value)}
                    type="number" min="0" step="0.01" placeholder="0.00" style={inpSty} />
                  <input value={li.total} onChange={e => setLineItem(i, 'total', e.target.value)}
                    type="number" min="0" step="0.01" placeholder="0.00"
                    style={{ ...inpSty, fontWeight: 600 }} />
                  <button type="button" onClick={() => removeLineItem(i)}
                    style={{ background: 'none', border: 'none', color: '#9CA3AF',
                      cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                </div>
              ))}
              {lineItemTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '5px 8px',
                  background: '#F7F5F0', fontSize: 12, fontWeight: 700,
                  borderTop: '1px solid #E8E4DC', color: '#0A1F44' }}>
                  Total: {f$(lineItemTotal)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Schedule item link */}
        {schedItems.length > 0 && (
          <div className="fg">
            <label className="flbl">Related Schedule Item <span style={{ color: '#9CA3AF' }}>(optional)</span></label>
            <select className="finp" style={ssty} value={form.relatedScheduleItemId}
              onChange={e => set('relatedScheduleItemId', e.target.value)}>
              <option value="">— None —</option>
              {schedItems.map(s => (
                <option key={s.id} value={s.id}>
                  {s.title}{s.scheduled_date ? ` · ${s.scheduled_date}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-navy" style={{ flex: 1 }} onClick={save}
            disabled={saving || uploading || extracting}>
            {saving ? 'Saving…' : 'Add Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AddPaymentModal ──────────────────────────────────────────────────────────

function AddPaymentModal({ inv, onClose, onSaved }) {
  const TODAY = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    amount:    inv.balance > 0 ? String(inv.balance.toFixed(2)) : '',
    paidDate:  TODAY,
    method:    'check',
    reference: '',
    notes:     '',
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const [warn,   setWarn]   = useState(null);  // overpayment warning state

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async (forceOverpay = false) => {
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) { setErr('Amount must be greater than 0'); return; }
    if (!form.paidDate)   { setErr('Date is required'); return; }
    if (!form.method)     { setErr('Method is required'); return; }

    // Overpayment check
    if (!forceOverpay && amt > inv.balance && inv.balance > 0) {
      setWarn(amt - inv.balance);
      return;
    }

    setErr(null);
    setWarn(null);
    setSaving(true);
    const res = await sbAddSubInvoicePayment({
      subInvoiceId: inv.id,
      amount:       amt,
      paidDate:     form.paidDate,
      method:       form.method,
      reference:    form.reference.trim() || undefined,
      notes:        form.notes.trim() || undefined,
    });
    setSaving(false);
    if (res.ok) {
      onSaved();
    } else {
      setErr(res.error || 'Save failed');
    }
  };

  const ssty = { appearance: 'none', paddingRight: 28 };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div className="modal-title" style={{ margin: 0 }}>Add Payment</div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
              Invoice #{inv.invoiceNumber} · {inv.subName} · Balance {f$(inv.balance)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20,
            color: '#9CA3AF', cursor: 'pointer' }}>×</button>
        </div>

        {err && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#DC2626',
            padding: '7px 10px', fontSize: 12, borderRadius: 4, marginBottom: 12 }}>{err}</div>
        )}

        {/* Overpayment warning */}
        {warn !== null && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E',
            padding: '10px 12px', fontSize: 12, borderRadius: 4, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              This will overpay by {f$(warn)}
            </div>
            <div style={{ marginBottom: 10 }}>Proceed with overpayment?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => save(true)} className="btn btn-navy"
                style={{ fontSize: 12, padding: '4px 12px' }}>Yes, save anyway</button>
              <button onClick={() => setWarn(null)} className="btn btn-ghost"
                style={{ fontSize: 12, padding: '4px 12px' }}>Go back</button>
            </div>
          </div>
        )}

        {warn === null && (
          <>
            <div className="fg">
              <label className="flbl">Amount *</label>
              <input className="finp" type="number" min="0.01" step="0.01"
                value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" />
            </div>

            <div className="fg">
              <label className="flbl">Date *</label>
              <input className="finp" type="date" value={form.paidDate}
                onChange={e => set('paidDate', e.target.value)} />
            </div>

            <div className="fg">
              <label className="flbl">Method *</label>
              <select className="finp" style={ssty} value={form.method} onChange={e => set('method', e.target.value)}>
                <option value="check">Check</option>
                <option value="ach">ACH</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="fg">
              <label className="flbl">Reference <span style={{ color: '#9CA3AF' }}>(check #, ACH ID, etc.)</span></label>
              <input className="finp" value={form.reference}
                onChange={e => set('reference', e.target.value)}
                placeholder="Check #1234" />
            </div>

            <div className="fg">
              <label className="flbl">Notes <span style={{ color: '#9CA3AF' }}>(optional)</span></label>
              <textarea className="finp" rows={2} value={form.notes}
                onChange={e => set('notes', e.target.value)}
                style={{ resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
              <button className="btn btn-navy" style={{ flex: 1 }} onClick={() => save()} disabled={saving}>
                {saving ? 'Saving…' : 'Record Payment'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
