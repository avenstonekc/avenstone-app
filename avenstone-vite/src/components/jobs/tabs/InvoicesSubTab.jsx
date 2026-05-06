import { useState, useEffect } from 'react';
import { sbLoadDrawsForJob, sbDeleteDrawSchedule } from '../../../lib/supabase';
import { f$, fD } from '../../../lib/utils';
import DrawModal from '../../modals/DrawModal';

const DRAW_STATUS = {
  planned:     { label: 'Planned',     bg: '#F3F4F6', color: '#6B7280' },
  in_progress: { label: 'In Progress', bg: '#DBEAFE', color: '#1e40af' },
  paid:        { label: 'Paid',        bg: '#D1FAE5', color: '#065f46' },
  cancelled:   { label: 'Cancelled',   bg: '#FEE2E2', color: '#991b1b' },
};

const isStaff = profile => ['owner', 'project_manager', 'sales_rep'].includes(profile?.role);

export default function InvoicesSubTab({ job, profile }) {
  const [draws, setDraws] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDraw, setModalDraw] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await sbLoadDrawsForJob(job.id);
      setDraws(data);
    } catch (e) {
      console.error('sbLoadDrawsForJob error:', e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [job.id]);

  const openCreate = () => { setModalDraw(null); setModalOpen(true); };
  const openEdit = draw => { setModalDraw(draw); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setModalDraw(null); };
  const onSaved = () => load();

  const handleDelete = async draw => {
    if (!window.confirm(`Delete Draw ${draw.draw_number}? This cannot be undone.`)) return;
    try {
      await sbDeleteDrawSchedule(draw.id);
      load();
    } catch (e) {
      alert(e.message || 'Delete failed.');
    }
  };

  const totalScheduled = draws.reduce((s, d) => s + Number(d.target_amount || 0), 0);
  const totalInvoiced  = draws.reduce((s, d) => s + Number(d.invoiced_amount || 0), 0);
  const totalPaid      = draws.reduce((s, d) => s + Number(d.paid_amount || 0), 0);

  const staff = isStaff(profile);

  return (
    <div>
      {/* Draw Schedule header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1F44' }}>Draw Schedule</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Planned milestone payments for this job</div>
        </div>
        {staff && (
          <button onClick={openCreate} className="btn btn-navy" style={{ fontSize: 12, padding: '6px 14px' }}>+ Add Draw</button>
        )}
      </div>

      {/* Draws list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading...</div>
      ) : draws.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 8, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>No draws planned yet. Add a draw to start the billing schedule for this job.</div>
          {staff && <button onClick={openCreate} className="btn btn-ghost" style={{ fontSize: 12 }}>+ Add Draw</button>}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {draws.map(draw => {
              const st = DRAW_STATUS[draw.status] || DRAW_STATUS.planned;
              return (
                <div key={draw.id} style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF' }}>#{draw.draw_number}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>{draw.title}</span>
                        <span style={{ fontSize: 10, background: st.bg, color: st.color, padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>{st.label}</span>
                      </div>
                      {draw.phase && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{draw.phase}</div>}
                      {draw.description && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{draw.description}</div>}
                    </div>
                    {staff && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                        <button onClick={() => openEdit(draw)} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>Edit</button>
                        <button onClick={() => handleDelete(draw)} style={{ fontSize: 11, padding: '4px 10px', background: 'none', border: '1px solid #fca5a5', color: '#ef4444', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Delete</button>
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

          {/* Summary line */}
          <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#6B7280', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>Total scheduled: <strong style={{ color: '#0A1F44' }}>{f$(totalScheduled)}</strong></span>
            <span>Total invoiced: <strong style={{ color: '#6B7280' }}>{f$(totalInvoiced)}</strong></span>
            <span>Total paid: <strong style={{ color: totalPaid > 0 ? '#22c55e' : '#6B7280' }}>{f$(totalPaid)}</strong></span>
          </div>
        </>
      )}

      {/* Invoices placeholder */}
      <div style={{ background: '#F7F5F0', border: '1px dashed #E8E4DC', borderRadius: 8, padding: '20px 16px', marginTop: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>Invoices</div>
        <div style={{ fontSize: 12, color: '#9CA3AF' }}>Coming in the next slice. Once draws are scheduled, you'll generate invoices from them here.</div>
      </div>

      {modalOpen && (
        <DrawModal
          job={job}
          existingDraws={draws}
          draw={modalDraw}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
