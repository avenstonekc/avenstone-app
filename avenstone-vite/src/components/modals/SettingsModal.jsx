import { useState, useEffect, Fragment } from 'react';
import { sb, AV_TENANT } from '../../lib/supabase';
import PushEnableButton from '../shared/PushEnableButton';

const NOTIF_EVENTS = [
  { key: 'note_posted', lb: 'New note posted' },
  { key: 'phase_complete', lb: 'Phase marked complete' },
  { key: 'co_submitted', lb: 'Change order submitted' },
  { key: 'co_approved', lb: 'Change order approved' },
  { key: 'co_rejected', lb: 'Change order rejected' },
  { key: 'job_message', lb: 'New message' },
  { key: 'assigned_to_job', lb: 'Assigned to project' },
  { key: 'phase_overdue', lb: 'Phase overdue' },
  { key: 'document_uploaded', lb: 'Document uploaded' },
  { key: 'daily_log_submitted', lb: 'Daily log submitted' },
];

export default function SettingsModal({ profile, setProfile, onClose }) {
  const [form, setForm] = useState({ full_name: profile?.full_name || '', phone: profile?.phone || '' });
  const [prefs, setPrefs] = useState(() => profile?.notification_prefs || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState('profile');
  const [pwForm, setPwForm] = useState({ newPw: '', confirmPw: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [co, setCo] = useState({ company_name: '', city: '', state: '', phone: '', website: '', tagline: '', year_founded: '', license_number: '' });
  const [coSaving, setCoSaving] = useState(false);
  const [coSaved, setCoSaved] = useState(false);
  const [profileUrl, setProfileUrl] = useState('');

  useEffect(() => {
    if (profile?.role !== 'owner' || !AV_TENANT) return;
    sb.from('company_profiles').select('*').eq('tenant_id', AV_TENANT).maybeSingle().then(({ data }) => {
      if (data) { setCo({ company_name: data.company_name || '', city: data.city || '', state: data.state || '', phone: data.phone || '', website: data.website || '', tagline: data.tagline || '', year_founded: data.year_founded || '', license_number: data.license_number || '' }); }
      setProfileUrl(`${window.location.origin}?pro=${AV_TENANT}`);
    });
  }, [profile?.role]);

  const saveCompany = async () => {
    setCoSaving(true);
    const row = { tenant_id: AV_TENANT, company_name: co.company_name, city: co.city, state: co.state, phone: co.phone, website: co.website, tagline: co.tagline, year_founded: co.year_founded ? parseInt(co.year_founded) : null, license_number: co.license_number, updated_at: new Date().toISOString() };
    await sb.from('company_profiles').upsert(row, { onConflict: 'tenant_id' });
    setCoSaving(false); setCoSaved(true); setTimeout(() => setCoSaved(false), 2500);
  };

  const changePassword = async () => {
    if (!pwForm.newPw || pwForm.newPw.length < 8) { setPwMsg('Password must be at least 8 characters.'); return; }
    if (pwForm.newPw !== pwForm.confirmPw) { setPwMsg('Passwords do not match.'); return; }
    setPwSaving(true); setPwMsg('');
    const { error } = await sb.auth.updateUser({ password: pwForm.newPw });
    if (error) { setPwMsg(error.message); } else { setPwMsg('Password updated successfully.'); setPwForm({ newPw: '', confirmPw: '' }); }
    setPwSaving(false); setTimeout(() => setPwMsg(''), 3000);
  };

  const togglePref = async (key, channel) => {
    const cur = prefs[key] || { email: true, sms: true };
    const next = { ...prefs, [key]: { ...cur, [channel]: !cur[channel] } };
    setPrefs(next);
    await sb.from('profiles').update({ notification_prefs: next }).eq('id', profile.id);
    setProfile(p => ({ ...p, notification_prefs: next }));
  };

  const saveProfile = async () => {
    setSaving(true);
    await sb.from('profiles').update({ full_name: form.full_name, phone: form.phone }).eq('id', profile.id);
    setProfile(p => ({ ...p, ...form }));
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const Toggle = ({ on, onToggle }) => (
    <div onClick={onToggle} style={{ width: 28, height: 16, background: on ? '#C9A84C' : '#E8E4DC', borderRadius: 8, position: 'relative', cursor: 'pointer', transition: 'background 0.2s', margin: '0 auto' }}>
      <div style={{ position: 'absolute', top: 2, left: on ? 14 : 2, width: 12, height: 12, background: '#fff', borderRadius: '50%', transition: 'left 0.2s' }} />
    </div>
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: '#0A1F44' }}>Settings</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: 'flex', border: '1px solid #E8E4DC', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
          {[['profile', 'Profile'], ['notifs', 'Notifications'], ['security', 'Security'], ...(profile?.role === 'owner' ? [['company', 'My Profile']] : [])].map(([v, lb]) => (
            <button key={v} onClick={() => setTab(v)} style={{ flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: tab === v ? '#0A1F44' : 'transparent', color: tab === v ? '#C9A84C' : '#9CA3AF' }}>{lb}</button>
          ))}
        </div>

        {tab === 'profile' && <>
          <div className="fg"><label className="flbl">Full Name</label><input className="finp" value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} /></div>
          <div className="fg"><label className="flbl">Phone (for SMS alerts)</label><input className="finp" type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="(816) 555-0000" /></div>
          <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', padding: '12px 14px', borderRadius: 4, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>SMS Alerts</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Receive text messages for notifications</div>
              </div>
              <div onClick={async () => { const val = !profile.notification_sms; await sb.from('profiles').update({ notification_sms: val }).eq('id', profile.id); setProfile(p => ({ ...p, notification_sms: val })); }}
                style={{ width: 36, height: 20, background: profile?.notification_sms ? '#C9A84C' : '#D1D5DB', borderRadius: 10, position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: profile?.notification_sms ? 18 : 2, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>Email: <strong style={{ color: '#0A1F44' }}>{profile?.email}</strong></div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>Role: <strong style={{ color: '#0A1F44' }}>{profile?.role}</strong></div>
          </div>
          <button className="btn btn-navy" style={{ width: '100%', marginBottom: 10 }} onClick={saveProfile} disabled={saving}>{saving ? 'Saving...' : (saved ? 'Saved!' : 'Save Changes')}</button>
          <PushEnableButton profile={profile} />
        </>}

        {tab === 'notifs' && <>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 12, lineHeight: 1.6 }}>Choose which events trigger email and SMS notifications. SMS requires a phone number and SMS alerts enabled.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px 12px', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Event</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>Email</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>SMS</div>
            {NOTIF_EVENTS.map(({ key, lb }) => {
              const p = prefs[key] || { email: true, sms: true };
              return (
                <Fragment key={key}>
                  <div style={{ fontSize: 12, color: '#374151' }}>{lb}</div>
                  <Toggle on={p.email !== false} onToggle={() => togglePref(key, 'email')} />
                  <Toggle on={p.sms !== false} onToggle={() => togglePref(key, 'sms')} />
                </Fragment>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>Changes save automatically.</div>
        </>}

        {tab === 'company' && profile?.role === 'owner' && <>
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: '#1E40AF' }}>
            Your public profile is how homeowners find and vet your company on the Avenstone Network.
            {profileUrl && <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#DBEAFE', padding: '2px 6px', borderRadius: 4, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profileUrl}</span>
              <button onClick={() => { navigator.clipboard.writeText(profileUrl); }} style={{ background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>Copy Link</button>
            </div>}
          </div>
          <div className="fg"><label className="flbl">Company Name *</label><input className="finp" value={co.company_name} onChange={e => setCo(p => ({ ...p, company_name: e.target.value }))} placeholder="Avenstone Contracting" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8 }}>
            <div className="fg"><label className="flbl">City</label><input className="finp" value={co.city} onChange={e => setCo(p => ({ ...p, city: e.target.value }))} placeholder="Kansas City" /></div>
            <div className="fg"><label className="flbl">State</label><input className="finp" value={co.state} onChange={e => setCo(p => ({ ...p, state: e.target.value }))} placeholder="MO" maxLength={2} /></div>
          </div>
          <div className="fg"><label className="flbl">Tagline</label><input className="finp" value={co.tagline} onChange={e => setCo(p => ({ ...p, tagline: e.target.value }))} placeholder="Building KC's finest homes since 2010" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="fg"><label className="flbl">Business Phone</label><input className="finp" type="tel" value={co.phone} onChange={e => setCo(p => ({ ...p, phone: e.target.value }))} placeholder="(816) 555-0000" /></div>
            <div className="fg"><label className="flbl">Year Founded</label><input className="finp" type="number" value={co.year_founded} onChange={e => setCo(p => ({ ...p, year_founded: e.target.value }))} placeholder="2010" /></div>
          </div>
          <div className="fg"><label className="flbl">License Number</label><input className="finp" value={co.license_number} onChange={e => setCo(p => ({ ...p, license_number: e.target.value }))} placeholder="MO-12345" /></div>
          <div className="fg"><label className="flbl">Website</label><input className="finp" value={co.website} onChange={e => setCo(p => ({ ...p, website: e.target.value }))} placeholder="https://yoursite.com" /></div>
          <button className="btn btn-navy" style={{ width: '100%', marginBottom: 8 }} onClick={saveCompany} disabled={coSaving || !co.company_name}>{coSaving ? 'Saving...' : coSaved ? '✓ Saved!' : 'Save Company Profile'}</button>
          {profileUrl && <a href={profileUrl} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', fontSize: 12, color: '#C9A84C', textDecoration: 'none' }}>Preview public profile →</a>}
        </>}

        {tab === 'security' && <>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 16, lineHeight: 1.6 }}>Choose a strong password at least 8 characters long.</div>
          {pwMsg && <div style={{ background: pwMsg.includes('success') ? '#D1FAE5' : '#FEF2F2', border: `1px solid ${pwMsg.includes('success') ? '#6EE7B7' : '#FECACA'}`, color: pwMsg.includes('success') ? '#065F46' : '#B91C1C', padding: '10px 12px', fontSize: 13, marginBottom: 12, borderRadius: 4 }}>{pwMsg}</div>}
          <div className="fg"><label className="flbl">New Password</label><input className="finp" type="password" value={pwForm.newPw} onChange={e => setPwForm(p => ({ ...p, newPw: e.target.value }))} placeholder="At least 8 characters" /></div>
          <div className="fg"><label className="flbl">Confirm Password</label><input className="finp" type="password" value={pwForm.confirmPw} onChange={e => setPwForm(p => ({ ...p, confirmPw: e.target.value }))} placeholder="Re-enter new password" /></div>
          <button className="btn btn-navy" style={{ width: '100%' }} onClick={changePassword} disabled={pwSaving || !pwForm.newPw || !pwForm.confirmPw}>{pwSaving ? 'Updating...' : 'Update Password'}</button>
        </>}
      </div>
    </div>
  );
}
