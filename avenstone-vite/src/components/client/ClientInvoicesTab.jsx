import { useState, useEffect } from 'react';
import { sbLoadInvoicesForJob, sbRegenerateInvoicePaymentUrl } from '../../lib/supabase';
import { f$, fD } from '../../lib/utils';

const STATUS_PILL = {
  sent:           { label: 'Awaiting payment', bg: '#DBEAFE', color: '#1e40af' },
  viewed:         { label: 'Awaiting payment', bg: '#DBEAFE', color: '#1e40af' },
  partially_paid: { label: 'Partially paid',   bg: '#FEF3C7', color: '#92400e' },
  paid:           { label: 'Paid',             bg: '#D1FAE5', color: '#065f46' },
  overdue:        { label: 'Overdue',          bg: '#FEE2E2', color: '#991b1b' },
  void:           { label: 'Void',             bg: '#F3F4F6', color: '#9CA3AF' },
};

const PAYABLE = new Set(['sent', 'viewed', 'partially_paid', 'overdue']);

export default function ClientInvoicesTab({ job }) {
  const [invoices, setInvoices]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [payingInvoiceId, setPayingInvoiceId] = useState(null);

  useEffect(() => {
    if (!job?.id) return;
    setLoading(true);
    setError(null);
    sbLoadInvoicesForJob(job.id)
      .then(data => { setInvoices(data); setLoading(false); })
      .catch(e => { setError(e.message || 'Failed to load invoices.'); setLoading(false); });
  }, [job?.id]);

  const handlePayNow = async invoice => {
    try {
      setPayingInvoiceId(invoice.id);
      setError(null);
      const url = await sbRegenerateInvoicePaymentUrl(invoice.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(`Could not generate payment link: ${e.message}`);
    } finally {
      setPayingInvoiceId(null);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading...</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16 }}>Invoices for this project</div>

      {error && (
        <div style={{ background: '#FEE2E2', color: '#991b1b', padding: '10px 12px', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {!invoices.length ? (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.7 }}>
            No invoices yet. We'll send invoices for this project as work progresses.
          </div>
        </div>
      ) : (
        invoices.map(inv => {
          const pill    = STATUS_PILL[inv.status] || STATUS_PILL.sent;
          const balance = Math.max(0, Number(inv.total_amount) - Number(inv.amount_paid));
          const isVoid  = inv.status === 'void';
          const isPaid  = inv.status === 'paid';

          return (
            <div key={inv.id} style={{
              background: '#fff',
              border: '1px solid #E8E4DC',
              padding: 16,
              marginBottom: 10,
              opacity: isVoid ? 0.6 : 1,
            }}>
              {/* Header row: invoice number + status pill */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44', textDecoration: isVoid ? 'line-through' : 'none' }}>
                  {inv.invoice_number}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                  background: pill.bg, color: pill.color, textTransform: 'uppercase',
                  flexShrink: 0, marginLeft: 8,
                }}>
                  {pill.label}
                </span>
              </div>

              {/* Dates */}
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
                <span>Date: <strong style={{ color: '#374151' }}>{fD(inv.invoice_date)}</strong></span>
                {inv.due_date && (
                  <span style={{ marginLeft: 16 }}>Due: <strong style={{ color: '#374151' }}>{fD(inv.due_date)}</strong></span>
                )}
              </div>

              {/* Amount rows */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14, background: '#F7F5F0', padding: '10px 12px' }}>
                {[
                  { lb: 'Total',   val: f$(Number(inv.total_amount)), c: '#0A1F44' },
                  { lb: 'Paid',    val: f$(Number(inv.amount_paid)),  c: Number(inv.amount_paid) > 0 ? '#22c55e' : '#6B7280' },
                  { lb: 'Balance', val: f$(balance),                  c: balance > 0 ? '#0A1F44' : '#22c55e' },
                ].map(({ lb, val, c }) => (
                  <div key={lb} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{lb}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              {!isVoid && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {inv.pdf_url && (
                    <button
                      onClick={() => window.open(inv.pdf_url, '_blank', 'noopener,noreferrer')}
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: '7px 14px' }}
                    >
                      View Invoice
                    </button>
                  )}
                  {PAYABLE.has(inv.status) && (
                    <button
                      onClick={() => handlePayNow(inv)}
                      disabled={payingInvoiceId === inv.id}
                      className="btn btn-navy"
                      style={{ fontSize: 12, padding: '7px 14px' }}
                    >
                      {payingInvoiceId === inv.id ? 'Loading...' : `Pay Now ${f$(balance)}`}
                    </button>
                  )}
                  {isPaid && (
                    <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, alignSelf: 'center' }}>✓ Paid in full</span>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
