import { useState } from 'react';
import { sb } from '../../lib/supabase';

export default function SetPasswordScr({ onDone }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (pw.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (pw !== pw2) { setErr("Passwords don't match."); return; }
    setSaving(true); setErr('');
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { setErr(error.message); setSaving(false); return; }
    onDone();
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 40, maxWidth: 400, width: '100%' }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: '#0A1F44', marginBottom: 4 }}>Set your password</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 24, lineHeight: 1.6 }}>Choose a password to secure your Avenstone account.</div>
        {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '10px 12px', fontSize: 13, marginBottom: 16, borderRadius: 4 }}>{err}</div>}
        <div className="fg"><label className="flbl">New Password</label><input className="finp" type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="At least 8 characters" /></div>
        <div className="fg"><label className="flbl">Confirm Password</label><input className="finp" type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Repeat password" onKeyDown={e => { if (e.key === 'Enter') save(); }} /></div>
        <button className={`btn ${pw && pw2 ? 'btn-navy' : 'btn-ghost'}`} style={{ width: '100%', marginTop: 8 }} onClick={save} disabled={saving || !pw || !pw2}>{saving ? 'Saving...' : 'Set Password & Continue →'}</button>
      </div>
    </div>
  );
}
