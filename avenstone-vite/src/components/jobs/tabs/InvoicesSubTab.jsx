import { useState, useEffect } from 'react';
import { sbLoadDrawsForJob, sbDeleteDrawSchedule, sbLoadInvoicesForJob, sbDeleteInvoice, sbVoidInvoice, sbResendInvoice, deriveInvoiceStatus, sbLoadDrawPackagesForJob } from '../../../lib/supabase';
import DrawPackagePickerModal from '../../modals/DrawPackagePickerModal';
import { f$, fD } from '../../../lib/utils';
import DrawModal from '../../modals/DrawModal';
import InvoiceComposerModal from '../../modals/InvoiceComposerModal';
import MarkPaidModal from '../../modals/MarkPaidModal';
import ComposeDrawScr from './ComposeDrawScr';

const DRAW_STATUS = {
  planned:     { label: 'Planned',     bg: '#F3F4F6', color: '#6B7280' },
  in_progress: { label: 'In Progress', bg: '#DBEAFE', color: '#1e40af' },
  paid:        { label: 'Paid',        bg: '#D1FAE5', color: '#065f46' },
  cancelled:   { label: 'Cancelled',   bg: '#FEE2E2', color: '#991b1b' },
};

const INVOICE_STATUS = {
  draft:          { label: 'Draft',    bg: '#F3F4F6', color: '#6B7280' },
  sent:           { label: 'Sent',     bg: '#DBEAFE', color: '#1e40af' },
  viewed:         { label: 'Viewed',   bg: '#EDE9FE', color: '#5b21b6' },
  partially_paid: { label: 'Partial',  bg: '#FEF3C7', color: '#92400e' },
  paid:           { label: 'Paid',     bg: '#D1FAE5', color: '#065f46' },
  overdue:        { label: 'Overdue',  bg: '#FEE2E2', color: '#991b1b' },
  void:           { label: 'Void',     bg: '#F3F4F6', color: '#9CA3AF' },
};

const isStaff = profile => ['owner', 'project_manager', 'sales_rep'].includes(profile?.role);

export default function InvoicesSubTab({ job, profile }) {
  const [draws, setDraws]       = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [drawPkgs, setDrawPkgs] = useState([]);
  const [loading, setLoading]   = useState(true);

  const [drawModal, setDrawModal]             = useState(false);
  const [editDraw, setEditDraw]               = useState(null);
  const [composerOpen, setComposerOpen]       = useState(false);
  const [editInvoice, setEditInvoice]         = useState(null);
  const [prefillDrawId, setPrefillDrawId]     = useState(null);
  const [markPaidInvoice, setMarkPaidInvoice]       = useState(null);
  const [resendingInvoiceId, setResendingInvoiceId] = useState(null);
  const [composeDrawOpen, setComposeDrawOpen]       = useState(false);
  const [pickerDraw, setPickerDraw]                 = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [d, inv, pkgs] = await Promise.all([
        sbLoadDrawsForJob(job.id),
        sbLoadInvoicesForJob(job.id),
        sbLoadDrawPackagesForJob(job.id),
      ]);
      setDraws(d);
      setInvoices(inv);
      setDrawPkgs(pkgs);
    } catch (e) {
      console.error('InvoicesSubTab load error:', e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [job.id]);

  const openAddDraw    = () => { setEditDraw(null); setDrawModal(true); };
  const openEditDraw   = draw => { setEditDraw(draw); setDrawModal(true); };
  const closeDrawModal = () => { setDrawModal(false); setEditDraw(null); };

  const openNewInvoice = (drawId = null) => {
    setEditInvoice(null);
    setPrefillDrawId(drawId);
    setComposerOpen(true);
  };
  const openEditInvoice = inv => {
    setEditInvoice(inv);
    setPrefillDrawId(null);
    setComposerOpen(true);
  };
  const closeComposer = () => {
    setComposerOpen(false);
    setEditInvoice(null);
    setPrefillDrawId(null);
  };

  const handleDeleteDraw = async draw => {
    if (!window.confirm(`Delete Draw ${draw.draw_number}? This cannot be undone.`)) return;
    try {
      await sbDeleteDrawSchedule(draw.id);
      load();
    } catch (e) {
      alert(e.message || 'Delete failed.');
    }
  };

  const handleDeleteInvoice = async inv => {
    if (!window.confirm(`Delete invoice ${inv.invoice_number}? This cannot be undone.`)) return;
    try {
      await sbDeleteInvoice(inv.id);
      load();
    } catch (e) {
      alert(e.message || 'Delete failed.');
    }
  };

  const handleResend = async inv => {
    if (!window.confirm(`Resend Invoice ${inv.invoice_number} to the client?`)) return;
    try {
      setResendingInvoiceId(inv.id);
      const result = await sbResendInvoice(inv.id);
      alert(`Invoice resent to ${result.sent_to}`);
    } catch (err) {
      alert(`Resend failed: ${err.message}`);
    } finally {
      setResendingInvoiceId(null);
    }
  };

  const handleVoidInvoice = async inv => {
    const reason = window.prompt(`Reason for voiding invoice ${inv.invoice_number}:`);
    if (reason === null) return;
    try {
      await sbVoidInvoice(inv.id, reason.trim() || null);
      load();
    } catch (e) {
      alert(e.message || 'Void failed.');
    }
  };

  const totalScheduled = draws.reduce((s, d) => s + Number(d.target_amount || 0), 0);
  const totalInvoiced  = draws.reduce((s, d) => s + Number(d.invoiced_amount || 0), 0);
  const totalPaid      = draws.reduce((s, d) => s + Number(d.paid_amount || 0), 0);

  const pkgByDraw = drawPkgs.reduce((m, p) => { if (!m[p.draw_id]) m[p.draw_id] = p; return m; }, {});

  const staff = isStaff(profile);

  return (
    <div>
      {/* ── Draw Schedule — cost-plus jobs only ── */}
      {job.cost_plus && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1F44' }}>Draw Schedule</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Planned milestone payments for this job</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {staff && (
                <button onClick={() => setComposeDrawOpen(true)} className="btn btn-gold" style={{ fontSize: 12, padding: '6px 14px' }}>Compose Draw</button>
              )}
              {staff && (
                <button onClick={openAddDraw} className="btn btn-navy" style={{ fontSize: 12, padding: '6px 14px' }}>+ Add Draw</button>
              )}
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading...</div>
          ) : draws.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 8, padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>No draws planned yet. Add a draw to start the billing schedule for this job.</div>
              {staff && <button onClick={openAddDraw} className="btn btn-ghost" style={{ fontSize: 12 }}>+ Add Draw</button>}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {draws.map(draw => {
                  const st  = DRAW_STATUS[draw.status] || DRAW_STATUS.planned;
                  const pkg = pkgByDraw[draw.id];
                  return (
                    <div key={draw.id} style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF' }}>#{draw.draw_number}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>{draw.title}</span>
                            <span style={{ fontSize: 10, background: st.bg, color: st.color, padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>{st.label}</span>
                            {pkg?.status === 'sent' && (
                              <span style={{ fontSize: 10, background: '#D1FAE5', color: '#065f46', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                                Sent to {pkg.recipient_label || pkg.recipient_email}
                              </span>
                            )}
                            {pkg?.status === 'previewed' && !pkg?.sent_at && (
                              <span style={{ fontSize: 10, background: '#DBEAFE', color: '#1e40af', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>Package ready</span>
                            )}
                          </div>
                          {draw.phase && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{draw.phase}</div>}
                          {draw.description && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{draw.description}</div>}
                        </div>
                        {staff && (
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => setPickerDraw(draw)}
                              className="btn btn-gold"
                              style={{ fontSize: 11, padding: '4px 10px' }}
                            >
                              {pkg?.status === 'sent' ? 'Package' : pkg ? 'Package' : 'Build Package'}
                            </button>
                            <button onClick={() => openEditDraw(draw)} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>Edit</button>
                            <button onClick={() => handleDeleteDraw(draw)} style={{ fontSize: 11, padding: '4px 10px', background: 'none', border: '1px solid #fca5a5', color: '#ef4444', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {[
                          ['Target', f$(draw.target_amount), '#0A1F44'],
                          ['Invoiced', draw.invoiced_amount > 0 ? f$(draw.invoiced_amount) : '—', '#6B7280'],
                          ['Paid', draw.paid_amount > 0 ? f$(draw.paid_amount) : '—', draw.paid_amount > 0 ? '#22c55e' : '#6B7280'],
                        ].map(([lb, val, c]) => (
                          <div key={lb} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{lb}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{val}</div>
                          </div>
                        ))}
                      </div>
                      {draw.target_date && (
                        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>Due: {fD(draw.target_date)}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#6B7280', display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
                <span>Total scheduled: <strong style={{ color: '#0A1F44' }}>{f$(totalScheduled)}</strong></span>
                <span>Total invoiced: <strong style={{ color: '#6B7280' }}>{f$(totalInvoiced)}</strong></span>
                <span>Total paid: <strong style={{ color: totalPaid > 0 ? '#22c55e' : '#6B7280' }}>{f$(totalPaid)}</strong></span>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Invoices — fixed-price jobs only ── */}
      {!job.cost_plus && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1F44' }}>Invoices</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>All invoices for this job</div>
            </div>
            {staff && (
              <button onClick={() => openNewInvoice(null)} className="btn btn-navy" style={{ fontSize: 12, padding: '6px 14px' }}>+ New Invoice</button>
            )}
          </div>

          {!loading && invoices.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 8, padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>No invoices yet. Create one to bill the client.</div>
              {staff && <button onClick={() => openNewInvoice(null)} className="btn btn-ghost" style={{ fontSize: 12 }}>+ New Invoice</button>}
            </div>
          ) : !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {invoices.map(inv => {
                const st = INVOICE_STATUS[deriveInvoiceStatus(inv)] || INVOICE_STATUS.draft;
                return (
                  <div key={inv.id} style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#0A1F44' }}>{inv.invoice_number}</span>
                          <span style={{ fontSize: 10, background: st.bg, color: st.color, padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>{st.label}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, color: '#6B7280' }}>Date: <strong style={{ color: '#0A1F44' }}>{fD(inv.invoice_date)}</strong></span>
                          {inv.due_date && <span style={{ fontSize: 12, color: '#6B7280' }}>Due: <strong style={{ color: '#0A1F44' }}>{fD(inv.due_date)}</strong></span>}
                          <span style={{ fontSize: 12, color: '#6B7280' }}>Total: <strong style={{ color: '#0A1F44' }}>{f$(inv.total_amount)}</strong></span>
                          {inv.amount_paid > 0 && (
                            <span style={{ fontSize: 12, color: '#22c55e' }}>Paid: <strong>{f$(inv.amount_paid)}</strong></span>
                          )}
                        </div>
                      </div>
                      {staff && inv.status !== 'void' && (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {inv.status === 'draft' && (
                            <>
                              <button onClick={() => openEditInvoice(inv)} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>Edit</button>
                              <button onClick={() => handleDeleteInvoice(inv)} style={{ fontSize: 11, padding: '4px 10px', background: 'none', border: '1px solid #fca5a5', color: '#ef4444', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                            </>
                          )}
                          {['sent', 'viewed', 'partially_paid', 'overdue'].includes(inv.status) && (
                            <button onClick={() => setMarkPaidInvoice(inv)} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', color: '#065f46', borderColor: '#6EE7B7' }}>Mark Paid</button>
                          )}
                          {['sent', 'viewed', 'partially_paid', 'overdue'].includes(inv.status) && (
                            <button
                              onClick={() => handleResend(inv)}
                              disabled={resendingInvoiceId === inv.id}
                              className="btn btn-ghost"
                              style={{ fontSize: 11, padding: '4px 10px', color: '#1e40af', borderColor: '#93c5fd' }}
                            >
                              {resendingInvoiceId === inv.id ? 'Resending...' : 'Resend'}
                            </button>
                          )}
                          {['sent', 'viewed', 'overdue'].includes(inv.status) && (
                            <button onClick={() => handleVoidInvoice(inv)} style={{ fontSize: 11, padding: '4px 10px', background: 'none', border: '1px solid #fca5a5', color: '#ef4444', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Void</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {drawModal && (
        <DrawModal
          job={job}
          existingDraws={draws}
          draw={editDraw}
          onClose={closeDrawModal}
          onSaved={load}
        />
      )}

      {composerOpen && !job.cost_plus && (
        <InvoiceComposerModal
          job={job}
          draws={draws}
          invoice={editInvoice}
          prefillDrawId={prefillDrawId}
          onClose={closeComposer}
          onSaved={load}
        />
      )}

      {markPaidInvoice && !job.cost_plus && (
        <MarkPaidModal
          invoice={markPaidInvoice}
          onClose={() => setMarkPaidInvoice(null)}
          onSaved={load}
        />
      )}

      {composeDrawOpen && job.cost_plus && (
        <ComposeDrawScr
          job={job}
          onClose={() => setComposeDrawOpen(false)}
          onComposed={() => { setComposeDrawOpen(false); load(); }}
        />
      )}

      {pickerDraw && (
        <DrawPackagePickerModal
          job={job}
          draw={pickerDraw}
          existingPkg={pkgByDraw[pickerDraw.id] || null}
          onClose={() => { setPickerDraw(null); load(); }}
        />
      )}
    </div>
  );
}
