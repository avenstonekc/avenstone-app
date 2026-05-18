import { useState, useEffect } from 'react';
import {
  sbGenerateInvoiceNumber,
  sbCreateInvoice,
  sbUpdateInvoice,
  sbLoadInvoice,
  sbSaveInvoiceLineItems,
  sbSendInvoice,
} from '../../lib/supabase';
import { f$ } from '../../lib/utils';

const today = () => new Date().toISOString().slice(0, 10);
const todayPlus30 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

const INVOICE_STATUS = {
  draft:          { label: 'Draft',          bg: '#F3F4F6', color: '#6B7280' },
  sent:           { label: 'Sent',           bg: '#DBEAFE', color: '#1e40af' },
  viewed:         { label: 'Viewed',         bg: '#EDE9FE', color: '#5b21b6' },
  partially_paid: { label: 'Partial',        bg: '#FEF3C7', color: '#92400e' },
  paid:           { label: 'Paid',           bg: '#D1FAE5', color: '#065f46' },
  overdue:        { label: 'Overdue',        bg: '#FEE2E2', color: '#991b1b' },
  void:           { label: 'Void',           bg: '#F3F4F6', color: '#9CA3AF' },
};

let tempIdCounter = 0;
const newTempId = () => `tmp_${++tempIdCounter}`;

const emptyLine = () => ({
  tempId: newTempId(),
  description: '',
  quantity: 1,
  unit: '',
  unit_price: 0,
  line_total: 0,
  phase: '',
  source_type: 'manual',
  source_id: null,
});

export default function InvoiceComposerModal({ job, draws, invoice, prefillDrawId, onClose, onSaved }) {
  const isEdit = !!invoice;

  const [loading, setLoading]             = useState(isEdit);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');
  const [nonDraftError, setNonDraftError] = useState('');

  const [drawId, setDrawId]               = useState(prefillDrawId || '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate]     = useState(today());
  const [dueDate, setDueDate]             = useState(todayPlus30());
  const [notes, setNotes]                 = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [taxAmount, setTaxAmount]         = useState(0);
  const [lineItems, setLineItems]         = useState([]);

  useEffect(() => {
    if (!isEdit) {
      sbGenerateInvoiceNumber()
        .then(num => setInvoiceNumber(num))
        .catch(() => setInvoiceNumber(''));
    } else {
      setLoading(true);
      sbLoadInvoice(invoice.id)
        .then(full => {
          if (full.status !== 'draft') {
            setNonDraftError('Only draft invoices can be edited. (Sent/paid invoice editing comes in a later phase.)');
            setLoading(false);
            return;
          }
          setDrawId(full.draw_id || '');
          setInvoiceNumber(full.invoice_number || '');
          setInvoiceDate(full.invoice_date || today());
          setDueDate(full.due_date || todayPlus30());
          setNotes(full.notes || '');
          setInternalNotes(full.internal_notes || '');
          setTaxAmount(Number(full.tax_amount || 0));
          setLineItems((full.line_items || []).map(li => ({
            tempId: newTempId(),
            description:  li.description  || '',
            quantity:     Number(li.quantity  ?? 1),
            unit:         li.unit         || '',
            unit_price:   Number(li.unit_price ?? 0),
            line_total:   Number(li.line_total ?? 0),
            phase:        li.phase        || '',
            source_type:  li.source_type  || 'manual',
            source_id:    li.source_id    || null,
          })));
          setLoading(false);
        })
        .catch(e => {
          setError(e.message || 'Failed to load invoice.');
          setLoading(false);
        });
    }
  }, []);

  const updateLine = (tempId, field, raw) => {
    setLineItems(prev => prev.map(li => {
      if (li.tempId !== tempId) return li;
      const updated = { ...li, [field]: raw };
      if (field === 'quantity' || field === 'unit_price') {
        const qty   = field === 'quantity'   ? Number(raw) : Number(li.quantity);
        const price = field === 'unit_price' ? Number(raw) : Number(li.unit_price);
        updated.line_total = qty * price;
      }
      return updated;
    }));
  };

  const addLine = () => setLineItems(prev => [...prev, emptyLine()]);
  const removeLine = tempId => setLineItems(prev => prev.filter(li => li.tempId !== tempId));

  const subtotal     = lineItems.reduce((s, li) => s + Number(li.line_total || 0), 0);
  const total_amount = subtotal + Number(taxAmount || 0);

  const save = async () => {
    setError('');
    if (!invoiceNumber.trim()) { setError('Invoice number is required.'); return; }
    if (lineItems.length === 0) { setError('Add at least one line item.'); return; }
    for (const li of lineItems) {
      if (!li.description.trim()) { setError('Every line item needs a description.'); return; }
      if (!(Number(li.quantity) > 0)) { setError('Quantity must be greater than 0 on all lines.'); return; }
      if (Number(li.unit_price) < 0) { setError('Unit price cannot be negative.'); return; }
    }
    if (!(total_amount > 0)) { setError('Total must be greater than 0.'); return; }

    setSaving(true);
    try {
      const meta = {
        draw_id:        drawId || null,
        invoice_number: invoiceNumber.trim(),
        invoice_date:   invoiceDate || today(),
        due_date:       dueDate || null,
        notes:          notes.trim() || null,
        internal_notes: internalNotes.trim() || null,
        subtotal,
        tax_amount:     Number(taxAmount || 0),
        total_amount,
      };

      const rows = lineItems.map((li, idx) => ({
        description:  li.description.trim(),
        quantity:     Number(li.quantity),
        unit:         li.unit.trim() || null,
        unit_price:   Number(li.unit_price),
        line_total:   Number(li.line_total),
        phase:        li.phase.trim() || null,
        source_type:  li.source_type || 'manual',
        source_id:    li.source_id   || null,
        display_order: idx,
      }));

      let invoiceId;
      if (!isEdit) {
        const created = await sbCreateInvoice(job.id, meta);
        invoiceId = created.id;
      } else {
        await sbUpdateInvoice(invoice.id, meta);
        invoiceId = invoice.id;
      }
      await sbSaveInvoiceLineItems(invoiceId, rows);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message || 'Save failed.');
      setSaving(false);
    }
  };

  const saveAndSend = async () => {
    setError('');
    if (!invoiceNumber.trim()) { setError('Invoice number is required.'); return; }
    if (lineItems.length === 0) { setError('Add at least one line item.'); return; }
    for (const li of lineItems) {
      if (!li.description.trim()) { setError('Every line item needs a description.'); return; }
      if (!(Number(li.quantity) > 0)) { setError('Quantity must be greater than 0 on all lines.'); return; }
      if (Number(li.unit_price) < 0) { setError('Unit price cannot be negative.'); return; }
    }
    if (!(total_amount > 0)) { setError('Total must be greater than 0.'); return; }

    setSaving(true);
    try {
      const meta = {
        draw_id:        drawId || null,
        invoice_number: invoiceNumber.trim(),
        invoice_date:   invoiceDate || today(),
        due_date:       dueDate || null,
        notes:          notes.trim() || null,
        internal_notes: internalNotes.trim() || null,
        subtotal,
        tax_amount:     Number(taxAmount || 0),
        total_amount,
      };

      const rows = lineItems.map((li, idx) => ({
        description:  li.description.trim(),
        quantity:     Number(li.quantity),
        unit:         li.unit.trim() || null,
        unit_price:   Number(li.unit_price),
        line_total:   Number(li.line_total),
        phase:        li.phase.trim() || null,
        source_type:  li.source_type || 'manual',
        source_id:    li.source_id   || null,
        display_order: idx,
      }));

      let invoiceId;
      if (!isEdit) {
        const created = await sbCreateInvoice(job.id, meta);
        invoiceId = created.id;
      } else {
        await sbUpdateInvoice(invoice.id, meta);
        invoiceId = invoice.id;
      }
      await sbSaveInvoiceLineItems(invoiceId, rows);

      const result = await sbSendInvoice(invoiceId);
      if (result.email_warning) {
        setError(`Invoice sent. Note: ${result.email_warning}`);
        onSaved();
        setSaving(false);
        // keep modal open briefly so PM sees the warning
        setTimeout(() => onClose(), 4000);
        return;
      }
      onSaved();
      onClose();
    } catch (e) {
      const msg = e.message || 'Send failed.';
      if (msg.toLowerCase().includes('draft saved') || isEdit) {
        setError(`Draft saved but send failed: ${msg}. Retry sending from the invoice list.`);
      } else {
        setError(msg);
      }
      setSaving(false);
    }
  };

  const inp  = { border: '1px solid #E8E4DC', padding: '8px 10px', fontSize: 16, borderRadius: 6, width: '100%', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };
  const lbl  = { fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'block' };
  const fg   = { marginBottom: 14 };
  const ninp = { ...inp, width: 'auto' };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680, width: '100%', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="modal-title" style={{ margin: 0 }}>{isEdit ? 'Edit Invoice' : 'New Invoice'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>Loading...</div>}

        {nonDraftError && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 6, padding: '12px 14px', fontSize: 13, color: '#92400e', marginBottom: 16 }}>
            {nonDraftError}
          </div>
        )}

        {!loading && !nonDraftError && (
          <>
            {/* Metadata */}
            <div style={fg}>
              <label style={lbl}>Draw (optional)</label>
              <select style={{ ...inp, appearance: 'none' }} value={drawId} onChange={e => setDrawId(e.target.value)}>
                <option value="">Standalone (no draw)</option>
                {draws.map(d => (
                  <option key={d.id} value={d.id}>Draw {d.draw_number} — {d.title}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Invoice #</label>
                <input style={inp} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Invoice Date</label>
                <input style={inp} type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Due Date</label>
                <input style={inp} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
            </div>

            <div style={fg}>
              <label style={lbl}>Notes (visible to client)</label>
              <textarea style={{ ...inp, minHeight: 56, resize: 'vertical' }} rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            <div style={fg}>
              <label style={lbl}>Internal notes (PM-only)</label>
              <textarea style={{ ...inp, minHeight: 44, resize: 'vertical' }} rows={2} value={internalNotes} onChange={e => setInternalNotes(e.target.value)} />
            </div>

            {/* Line items */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0A1F44', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Line Items</div>

              {lineItems.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px 60px 90px 90px 80px 1fr 24px', gap: 6, marginBottom: 4, padding: '0 4px' }}>
                  {['Description','Qty','Unit','Unit Price','Total','Phase','',''].map((h, i) => (
                    <div key={i} style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {lineItems.map(li => (
                  <div key={li.tempId} style={{ display: 'grid', gridTemplateColumns: '2fr 60px 60px 90px 90px 80px 1fr 24px', gap: 6, alignItems: 'center' }}>
                    <input style={ninp} placeholder="Description" value={li.description} onChange={e => updateLine(li.tempId, 'description', e.target.value)} />
                    <input style={ninp} type="number" min="0" step="any" value={li.quantity} onChange={e => updateLine(li.tempId, 'quantity', e.target.value)} />
                    <input style={ninp} placeholder="ea" value={li.unit} onChange={e => updateLine(li.tempId, 'unit', e.target.value)} />
                    <input style={ninp} type="number" min="0" step="0.01" placeholder="0.00" value={li.unit_price} onChange={e => updateLine(li.tempId, 'unit_price', e.target.value)} />
                    <input style={ninp} type="number" min="0" step="0.01" value={li.line_total} onChange={e => updateLine(li.tempId, 'line_total', e.target.value)} />
                    <input style={ninp} placeholder="Framing" value={li.phase} onChange={e => updateLine(li.tempId, 'phase', e.target.value)} />
                    <div />
                    <button onClick={() => removeLine(li.tempId)} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={addLine} className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}>+ Manual Line</button>
                <span style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>Adding lines from the estimate or change orders comes in the next slice.</span>
              </div>
            </div>

            {/* Totals */}
            <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 6, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#6B7280' }}>Subtotal: <strong style={{ color: '#0A1F44' }}>{f$(subtotal)}</strong></span>
                <span style={{ fontSize: 13, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Tax: <strong>$</strong>
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={taxAmount}
                    onChange={e => setTaxAmount(Number(e.target.value || 0))}
                    style={{ border: '1px solid #E8E4DC', padding: '4px 6px', fontSize: 13, borderRadius: 4, width: 80, fontFamily: 'inherit', textAlign: 'right' }}
                  />
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0A1F44' }}>Total: {f$(total_amount)}</span>
              </div>
            </div>

            {error && (
              <div style={{ background: '#FEE2E2', color: '#991b1b', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
              <button onClick={save} disabled={saving} className="btn btn-navy" style={{ flex: 1 }}>{saving ? 'Saving...' : 'Save Draft'}</button>
              <button onClick={saveAndSend} disabled={saving || total_amount <= 0 || lineItems.length === 0} className="btn btn-gold" style={{ flex: 2 }}>{saving ? 'Sending...' : 'Save & Send'}</button>
            </div>
          </>
        )}

        {!loading && nonDraftError && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={onClose} className="btn btn-ghost">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
