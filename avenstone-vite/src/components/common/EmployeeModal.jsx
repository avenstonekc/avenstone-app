import { useState, useEffect } from 'react';
import { sbInviteStaff, sbFindProfileByEmail, sbSaveEmployeeDetails, sbAddPayRate, sbLoadEmployeeDetails, sbLoadPayRates, sbDeletePayRate, sbResendSetupEmail } from '../../lib/supabase';
import { effectiveRate, chicagoDate } from '../../lib/earnings';

// TIME_CLOCK_ARC S2 — owner add/edit employee. Pay-rate history is APPEND-ONLY (the UI never
// edits an old row): a raise is a new effective-dated row; a fat-finger is delete + re-add.

const money = (n) => n == null ? '—' : `$${Number(n).toFixed(2)}`;
const todayStr = () => chicagoDate(new Date().toISOString());

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</label>
    {children}
  </div>
);
const inp = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 16, fontFamily: 'var(--font-body)', color: 'var(--text-primary)', background: 'var(--card-bg)', boxSizing: 'border-box' };

function ClassToggle({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2, background: 'var(--bg-alt)', borderRadius: 8, padding: 3, width: 'fit-content' }}>
      {[['w2', 'W-2'], ['1099', '1099']].map(([v, lb]) => (
        <button key={v} type="button" onClick={() => onChange(v)} style={{
          border: 'none', cursor: 'pointer', borderRadius: 6, padding: '6px 18px', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)',
          background: value === v ? 'var(--card-bg)' : 'transparent', color: value === v ? 'var(--navy-900)' : 'var(--text-muted)',
          boxShadow: value === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', minHeight: 36,
        }}>{lb}</button>
      ))}
    </div>
  );
}

export default function EmployeeModal({ mode, user, onClose, onSaved }) {
  const isAdd = mode === 'add';
  const [f, setF] = useState({ name: '', email: '', phone: '', address: '', startDate: todayStr(), classification: 'w2', rate: '', effDate: todayStr() });
  const [details, setDetails] = useState(null);
  const [rates, setRates] = useState([]);
  const [changeRate, setChangeRate] = useState(null); // { rate, effDate } when adding a new rate
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [existed, setExisted] = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  useEffect(() => {
    if (isAdd || !user) return;
    Promise.all([sbLoadEmployeeDetails(user.id), sbLoadPayRates(user.id)]).then(([d, r]) => {
      setDetails(d.data);
      setF(p => ({ ...p, classification: d.data?.classification || 'w2', phone: d.data?.phone || '', address: d.data?.address || '', startDate: d.data?.start_date || '' }));
      setRates(r.data || []);
    });
  }, [isAdd, user]);

  const curRate = effectiveRate(rates, todayStr());

  // ── Add flow ──
  const submitAdd = async () => {
    if (!f.name.trim() || !f.email.trim()) { setErr('Name and email are required.'); return; }
    if (!f.rate || Number(f.rate) <= 0) { setErr('Enter a starting hourly rate.'); return; }
    setBusy(true); setErr('');
    const inv = await sbInviteStaff(f.name.trim(), f.email.trim(), 'crew');
    let userId = inv.user_id, wasExisting = false;
    if (!userId) {
      if (/already|registered|exist/i.test(inv.error || '')) {
        const found = await sbFindProfileByEmail(f.email.trim());
        if (found.ok && found.data) { userId = found.data.id; wasExisting = true; }
        else { setErr(inv.error || 'That email already has an account but no profile was found.'); setBusy(false); return; }
      } else { setErr(inv.error || 'Invite failed — is send-invite deployed?'); setBusy(false); return; }
    }
    const d = await sbSaveEmployeeDetails(userId, { classification: f.classification, phone: f.phone, address: f.address, startDate: f.startDate });
    if (!d.ok) { setErr('Saved the invite but details failed: ' + d.error); setBusy(false); return; }
    const r = await sbAddPayRate(userId, f.rate, f.effDate);
    if (!r.ok) { setErr('Saved details but the rate failed: ' + r.error); setBusy(false); return; }
    setBusy(false);
    if (wasExisting) setExisted(true); else onSaved();
  };

  // ── Detail flow ──
  const saveDetails = async () => {
    setBusy(true); setErr('');
    const d = await sbSaveEmployeeDetails(user.id, { classification: f.classification, phone: f.phone, address: f.address, startDate: f.startDate });
    setBusy(false);
    if (!d.ok) { setErr(d.error); return; }
    setDetails(d.data); onSaved?.();
  };
  const addRate = async () => {
    if (!changeRate?.rate || Number(changeRate.rate) <= 0) { setErr('Enter a rate.'); return; }
    setBusy(true); setErr('');
    const r = await sbAddPayRate(user.id, changeRate.rate, changeRate.effDate);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setRates(p => [r.data, ...p].sort((a, b) => b.effective_date.localeCompare(a.effective_date)));
    setChangeRate(null);
  };
  const delRate = async (id) => {
    if (!window.confirm('Delete this rate row? (Use this only to fix a mistake — a raise should be a new row.)')) return;
    const r = await sbDeletePayRate(id);
    if (!r.ok) { setErr(r.error); return; }
    setRates(p => p.filter(x => x.id !== id));
  };
  const resend = async () => {
    const r = await sbResendSetupEmail((isAdd ? f.email : user.email).trim());
    setResendMsg(r.ok ? 'Setup email sent.' : 'Resend failed: ' + r.error);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,31,68,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', width: '100%', maxWidth: 440, maxHeight: '88vh', borderRadius: 14, padding: 22, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--text-primary)' }}>{isAdd ? 'Add employee' : (user?.full_name || user?.email)}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
        </div>

        {err && <div style={{ padding: '10px 12px', background: 'var(--red-bg)', color: 'var(--red-text)', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{err}</div>}

        {isAdd && existed ? (
          <div>
            <div style={{ padding: '12px 14px', background: 'var(--amber-bg)', color: 'var(--amber-text-strong)', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
              That email already had an account — details and rate were saved. No new invite was sent.
            </div>
            <button className="btn btn-navy" style={{ width: '100%', marginBottom: 8 }} onClick={resend}>Resend setup email</button>
            {resendMsg && <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 8 }}>{resendMsg}</div>}
            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onSaved}>Done</button>
          </div>
        ) : isAdd ? (
          <>
            <Field label="Name *"><input style={inp} value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} /></Field>
            <Field label="Email *"><input style={inp} type="email" value={f.email} onChange={e => setF(p => ({ ...p, email: e.target.value }))} /></Field>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><Field label="Phone"><input style={inp} value={f.phone} onChange={e => setF(p => ({ ...p, phone: e.target.value }))} /></Field></div>
              <div style={{ flex: 1 }}><Field label="Start date"><input style={inp} type="date" value={f.startDate} onChange={e => setF(p => ({ ...p, startDate: e.target.value }))} /></Field></div>
            </div>
            <Field label="Address"><input style={inp} value={f.address} onChange={e => setF(p => ({ ...p, address: e.target.value }))} /></Field>
            <Field label="Classification"><ClassToggle value={f.classification} onChange={v => setF(p => ({ ...p, classification: v }))} /></Field>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><Field label="Hourly rate *"><input style={inp} type="number" step="0.01" min="0" placeholder="$/hr" value={f.rate} onChange={e => setF(p => ({ ...p, rate: e.target.value }))} /></Field></div>
              <div style={{ flex: 1 }}><Field label="Rate effective"><input style={inp} type="date" value={f.effDate} onChange={e => setF(p => ({ ...p, effDate: e.target.value }))} /></Field></div>
            </div>
            <button className="btn btn-navy" style={{ width: '100%', marginTop: 6 }} onClick={submitAdd} disabled={busy}>{busy ? 'Adding…' : 'Add & send invite'}</button>
            <div style={{ fontSize: 11, color: 'var(--text-subtle)', textAlign: 'center', marginTop: 8 }}>They'll get an email to set a password, then land on their time clock.</div>
          </>
        ) : (
          <>
            {/* current rate */}
            <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>Current rate</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy-900)' }}>{money(curRate)}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>/hr</span></div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, background: 'var(--neutral-bg)', color: 'var(--text-secondary)', padding: '4px 12px', borderRadius: 20 }}>{f.classification === 'w2' ? 'W-2' : '1099'}</span>
            </div>

            <Field label="Classification"><ClassToggle value={f.classification} onChange={v => setF(p => ({ ...p, classification: v }))} /></Field>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><Field label="Phone"><input style={inp} value={f.phone} onChange={e => setF(p => ({ ...p, phone: e.target.value }))} /></Field></div>
              <div style={{ flex: 1 }}><Field label="Start date"><input style={inp} type="date" value={f.startDate || ''} onChange={e => setF(p => ({ ...p, startDate: e.target.value }))} /></Field></div>
            </div>
            <Field label="Address"><input style={inp} value={f.address} onChange={e => setF(p => ({ ...p, address: e.target.value }))} /></Field>
            <button className="btn btn-navy" style={{ width: '100%', marginBottom: 16 }} onClick={saveDetails} disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>

            {/* rate history */}
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: 'var(--text-subtle)', textTransform: 'uppercase', marginBottom: 8 }}>Rate history (append-only)</div>
            {rates.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginBottom: 8 }}>No rates yet.</div>}
            {rates.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{money(r.rate)}/hr</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>from {r.effective_date}</span>
                  {r.effective_date > todayStr() && <span style={{ fontSize: 10, color: 'var(--amber-text-strong)', marginLeft: 6 }}>future</span>}
                </div>
                <button onClick={() => delRate(r.id)} title="Delete (fix a mistake only)" style={{ background: 'none', border: 'none', color: 'var(--red-text)', fontSize: 12, cursor: 'pointer' }}>Delete</button>
              </div>
            ))}

            {changeRate ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
                <div style={{ flex: 1 }}><Field label="New rate"><input style={inp} type="number" step="0.01" min="0" value={changeRate.rate} onChange={e => setChangeRate(p => ({ ...p, rate: e.target.value }))} /></Field></div>
                <div style={{ flex: 1 }}><Field label="Effective"><input style={inp} type="date" value={changeRate.effDate} onChange={e => setChangeRate(p => ({ ...p, effDate: e.target.value }))} /></Field></div>
                <button className="btn btn-navy" style={{ marginBottom: 12 }} onClick={addRate} disabled={busy}>Add</button>
                <button className="btn btn-ghost" style={{ marginBottom: 12 }} onClick={() => setChangeRate(null)}>✕</button>
              </div>
            ) : (
              <button className="btn btn-ghost" style={{ width: '100%', marginTop: 4 }} onClick={() => setChangeRate({ rate: '', effDate: todayStr() })}>+ Change rate (new effective row)</button>
            )}

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost" style={{ width: '100%', fontSize: 12 }} onClick={resend}>Resend setup email</button>
              {resendMsg && <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>{resendMsg}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
