import { useState } from 'react';
import { fillPaperwork } from '../../lib/irsForms';
import { sbUploadPaperworkPdf, sbCompletePaperwork } from '../../lib/supabase';
import SignaturePad from '../auth/SignaturePad';

// TIME_CLOCK_ARC S2b — recipient fill-and-sign card (crew + sub). Shows only when an open
// ('sent') request exists. Renders a mobile HTML form (NOT the raw PDF), then fills the OFFICIAL
// IRS PDF client-side, e-signs, uploads to private storage. Field values live in memory only.

const digitsOnly = s => String(s || '').replace(/\D/g, '');
const todayStr = () => { const d = new Date(); return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`; };
const inp = { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 16, fontFamily: 'var(--font-body)', color: 'var(--text-primary)', background: 'var(--card-bg)', boxSizing: 'border-box' };
const Fld = ({ label, children, req }) => (
  <div style={{ marginBottom: 12 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}{req && <span style={{ color: 'var(--red-text)' }}> *</span>}</label>
    {children}
  </div>
);
function Radio({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {options.map(([v, lb]) => (
        <button key={v} type="button" onClick={() => onChange(v)} style={{
          textAlign: 'left', padding: '10px 12px', border: `1.5px solid ${value === v ? 'var(--gold-500)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer',
          background: value === v ? 'var(--surface)' : 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 14, fontWeight: value === v ? 600 : 400, minHeight: 44,
        }}>{value === v ? '● ' : '○ '}{lb}</button>
      ))}
    </div>
  );
}

export default function PaperworkCard({ request, profile, onDone }) {
  const isW4 = request.doc_type === 'w4';
  const label = isW4 ? 'W-4' : 'W-9';
  const [open, setOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [f, setF] = useState(isW4
    ? { firstMi: '', lastName: '', address: '', cityStateZip: '', ssn: '', filingStatus: 'single', showOpt: false, step2c: false, step3_children: '', step3_others: '', step3_total: '', step4a: '', step4b: '', step4c: '' }
    : { name: profile?.full_name || '', businessName: '', classification: 'individual', address: '', cityStateZip: '', tinType: 'ssn', tin: '' });

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const validate = () => {
    if (isW4) {
      if (!f.firstMi.trim() || !f.lastName.trim() || !f.address.trim() || !f.cityStateZip.trim()) return 'Fill in your name and address.';
      if (digitsOnly(f.ssn).length !== 9) return 'Enter a valid 9-digit Social Security Number.';
    } else {
      if (!f.name.trim() || !f.address.trim() || !f.cityStateZip.trim()) return 'Fill in your name and address.';
      if (digitsOnly(f.tin).length !== 9) return `Enter a valid 9-digit ${f.tinType === 'ein' ? 'EIN' : 'SSN'}.`;
    }
    return null;
  };

  const proceedToSign = () => { const v = validate(); if (v) { setErr(v); return; } setErr(''); setSigning(true); };

  const submit = async (signaturePng) => {
    setBusy(true); setErr('');
    try {
      const [tmpl, font] = await Promise.all([
        fetch(`/irs/${isW4 ? 'fw4' : 'fw9'}.pdf`).then(r => r.arrayBuffer()),
        fetch('/irs/LiberationSans-Regular.ttf').then(r => r.arrayBuffer()),
      ]);
      const bytes = await fillPaperwork(request.doc_type, f, signaturePng, todayStr(), { templateBytes: tmpl, fontBytes: font });
      const up = await sbUploadPaperworkPdf(request.doc_type, bytes);
      if (!up.ok) throw new Error(up.error);
      const done = await sbCompletePaperwork(request.id, up.path);
      if (!done.ok) throw new Error(done.error);
      onDone?.();
    } catch (e) {
      setErr('Could not submit: ' + (e.message || e)); setBusy(false); setSigning(false);
    }
  };

  if (!open) {
    return (
      <div className="card" style={{ padding: 16, marginBottom: 16, border: '2px solid var(--amber-border)', background: 'var(--amber-bg-soft, #FEF9EC)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber-text-deep, #78350F)' }}>Paperwork requested</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 12px' }}>Your manager sent you a <strong>{label}</strong> to complete and sign.</div>
        <button className="btn btn-navy" style={{ width: '100%', minHeight: 48, fontSize: 15 }} onClick={() => setOpen(true)}>Fill out {label}</button>
      </div>
    );
  }

  if (signing) {
    return (
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Sign your {label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, lineHeight: 1.5 }}>
          By signing, I declare under penalties of perjury that the information I entered is true and correct, that this is my legal electronic signature, and I consent to sign this {label} electronically. My IP address and device are recorded as signing evidence.
        </div>
        {err && <div style={{ padding: '10px 12px', background: 'var(--red-bg)', color: 'var(--red-text)', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{err}</div>}
        {busy ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Submitting…</div>
          : <SignaturePad label={`Sign to submit your ${label}`} onSave={submit} onCancel={() => setSigning(false)} />}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Complete your {label}</div>
      {err && <div style={{ padding: '10px 12px', background: 'var(--red-bg)', color: 'var(--red-text)', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{err}</div>}

      {isW4 ? (
        <>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><Fld label="First name & MI" req><input style={inp} value={f.firstMi} onChange={e => set('firstMi', e.target.value)} /></Fld></div>
            <div style={{ flex: 1 }}><Fld label="Last name" req><input style={inp} value={f.lastName} onChange={e => set('lastName', e.target.value)} /></Fld></div>
          </div>
          <Fld label="Address" req><input style={inp} value={f.address} onChange={e => set('address', e.target.value)} /></Fld>
          <Fld label="City, state, ZIP" req><input style={inp} value={f.cityStateZip} onChange={e => set('cityStateZip', e.target.value)} /></Fld>
          <Fld label="Social Security Number" req><input style={inp} inputMode="numeric" placeholder="123-45-6789" value={f.ssn} onChange={e => set('ssn', e.target.value)} /></Fld>
          <Fld label="Filing status" req><Radio value={f.filingStatus} onChange={v => set('filingStatus', v)} options={[['single', 'Single or Married filing separately'], ['mfj', 'Married filing jointly (or qualifying surviving spouse)'], ['hoh', 'Head of household']]} /></Fld>
          <button type="button" onClick={() => set('showOpt', !f.showOpt)} style={{ background: 'none', border: 'none', color: 'var(--gold-500)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 0', marginBottom: 8 }}>{f.showOpt ? '▲ Hide' : '▼ Steps 2–4 (optional)'}</button>
          {f.showOpt && (
            <div style={{ paddingLeft: 8, borderLeft: '2px solid var(--border)', marginBottom: 8 }}>
              <Fld label="Step 3 — qualifying children ($)"><input style={inp} inputMode="numeric" value={f.step3_children} onChange={e => set('step3_children', e.target.value)} /></Fld>
              <Fld label="Step 3 — other dependents ($)"><input style={inp} inputMode="numeric" value={f.step3_others} onChange={e => set('step3_others', e.target.value)} /></Fld>
              <Fld label="Step 3 — total ($)"><input style={inp} inputMode="numeric" value={f.step3_total} onChange={e => set('step3_total', e.target.value)} /></Fld>
              <Fld label="Step 4(a) — other income"><input style={inp} inputMode="numeric" value={f.step4a} onChange={e => set('step4a', e.target.value)} /></Fld>
              <Fld label="Step 4(b) — deductions"><input style={inp} inputMode="numeric" value={f.step4b} onChange={e => set('step4b', e.target.value)} /></Fld>
              <Fld label="Step 4(c) — extra withholding"><input style={inp} inputMode="numeric" value={f.step4c} onChange={e => set('step4c', e.target.value)} /></Fld>
            </div>
          )}
        </>
      ) : (
        <>
          <Fld label="Name (as shown on your tax return)" req><input style={inp} value={f.name} onChange={e => set('name', e.target.value)} /></Fld>
          <Fld label="Business name (if different)"><input style={inp} value={f.businessName} onChange={e => set('businessName', e.target.value)} /></Fld>
          <Fld label="Federal tax classification" req><Radio value={f.classification} onChange={v => set('classification', v)} options={[['individual', 'Individual / sole proprietor'], ['c_corp', 'C corporation'], ['s_corp', 'S corporation'], ['partnership', 'Partnership'], ['trust', 'Trust / estate'], ['llc', 'LLC'], ['other', 'Other']]} /></Fld>
          <Fld label="Address" req><input style={inp} value={f.address} onChange={e => set('address', e.target.value)} /></Fld>
          <Fld label="City, state, ZIP" req><input style={inp} value={f.cityStateZip} onChange={e => set('cityStateZip', e.target.value)} /></Fld>
          <Fld label="Taxpayer ID" req>
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg-alt)', borderRadius: 8, padding: 3, marginBottom: 8, width: 'fit-content' }}>
              {[['ssn', 'SSN'], ['ein', 'EIN']].map(([v, lb]) => (
                <button key={v} type="button" onClick={() => set('tinType', v)} style={{ border: 'none', cursor: 'pointer', borderRadius: 6, padding: '6px 18px', fontSize: 13, fontWeight: 600, background: f.tinType === v ? 'var(--card-bg)' : 'transparent', color: f.tinType === v ? 'var(--navy-900)' : 'var(--text-muted)', minHeight: 36 }}>{lb}</button>
              ))}
            </div>
            <input style={inp} inputMode="numeric" placeholder={f.tinType === 'ein' ? '12-3456789' : '123-45-6789'} value={f.tin} onChange={e => set('tin', e.target.value)} />
          </Fld>
        </>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn btn-navy" style={{ flex: 2, minHeight: 46 }} onClick={proceedToSign}>Review & sign →</button>
      </div>
    </div>
  );
}
