import { useState, useEffect, Fragment } from 'react';
import { sb, AV_TENANT, sbLoadQbCategoryMap, sbUpsertQbCategoryMap, sbLoadCategoryConfig, sbSaveCategoryConfig } from '../../lib/supabase';
import { DEFAULT_CATEGORY_CONFIG } from '../../lib/markupConfig';
import PushEnableButton from '../shared/PushEnableButton';
import { TextToSpeech, QueueStrategy } from '@capacitor-community/text-to-speech';

const QB_TYPES = [
  ['client_payment', 'Client Payment'], ['client_deposit', 'Deposit'], ['client_refund', 'Refund'],
  ['sub_payout', 'Sub Payout'], ['vendor_payment', 'Vendor Payment'], ['material_purchase', 'Materials'],
  ['equipment_rental', 'Equipment Rental'], ['permit', 'Permit'], ['fuel', 'Fuel'],
  ['commission', 'Commission'], ['labor', 'Labor'], ['other_expense', 'Other Expense'], ['other_income', 'Other Income'],
];

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
  const [qbMap, setQbMap] = useState({});
  const [qbSaving, setQbSaving] = useState(null);
  const [allVoices, setAllVoices] = useState([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [markupCfg, setMarkupCfg] = useState({ ...DEFAULT_CATEGORY_CONFIG });
  const [markupSaving, setMarkupSaving] = useState(false);
  const [markupMsg, setMarkupMsg] = useState('');
  const [selectedVoiceUri, setSelectedVoiceUri] = useState(() => {
    try { return localStorage.getItem('av_tts_voice_uri') || ''; } catch { return ''; }
  });
  const [testingVoice, setTestingVoice] = useState(null);

  useEffect(() => {
    if (tab !== 'voice') return;
    setVoicesLoading(true);
    TextToSpeech.getSupportedVoices()
      .then(({ voices }) => setAllVoices(voices || []))
      .catch(() => setAllVoices([]))
      .finally(() => setVoicesLoading(false));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'markup' || !['owner', 'project_manager'].includes(profile?.role)) return;
    sbLoadCategoryConfig(AV_TENANT).then(cfg => {
      if (cfg) setMarkupCfg({ ...DEFAULT_CATEGORY_CONFIG, ...cfg });
    });
  }, [tab]);

  const saveMarkupConfig = async () => {
    setMarkupSaving(true); setMarkupMsg('');
    const result = await sbSaveCategoryConfig(AV_TENANT, markupCfg);
    setMarkupMsg(result.ok ? 'Saved' : `Error: ${result.error}`);
    setMarkupSaving(false);
    if (result.ok) setTimeout(() => setMarkupMsg(''), 2500);
  };

  useEffect(() => {
    if (tab !== 'quickbooks' || profile?.role !== 'owner') return;
    sbLoadQbCategoryMap().then(rows => {
      const m = {};
      rows.forEach(r => { m[r.tx_type] = { account: r.qb_account || '', cls: r.qb_class || '' }; });
      QB_TYPES.forEach(([t]) => { if (!m[t]) m[t] = { account: '', cls: '' }; });
      setQbMap(m);
    });
  }, [tab]);

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

  const saveQbMapping = async (type) => {
    setQbSaving(type);
    const row = qbMap[type] || { account: '', cls: '' };
    await sbUpsertQbCategoryMap(type, row.account, row.cls);
    setQbSaving(null);
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
          {[['profile', 'Profile'], ['notifs', 'Notifications'], ['security', 'Security'], ['voice', 'Voice'], ...(['owner', 'project_manager'].includes(profile?.role) ? [['markup', 'Markup']] : []), ...(profile?.role === 'owner' ? [['company', 'My Profile'], ['quickbooks', 'QuickBooks']] : [])].map(([v, lb]) => (
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

        {tab === 'voice' && (() => {
          const enVoices = allVoices.map((v, i) => ({ ...v, originalIndex: i })).filter(v => v.lang.startsWith('en'));
          return (
            <>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 12, lineHeight: 1.6 }}>
                Choose the AI agent voice. Tap Test to preview. Changes take effect on the next spoken response.
              </div>
              {voicesLoading ? (
                <div style={{ textAlign: 'center', color: '#9CA3AF', padding: 24, fontSize: 13 }}>Loading voices…</div>
              ) : enVoices.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9CA3AF', padding: 24, fontSize: 13, lineHeight: 1.6 }}>
                  No English voices found.<br />Check iOS Settings → Accessibility → Spoken Content → Voices.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
                  {enVoices.map((voice) => {
                    const isSelected = voice.voiceURI === selectedVoiceUri;
                    const isTesting  = testingVoice === voice.voiceURI;
                    return (
                      <div
                        key={voice.voiceURI}
                        onClick={() => {
                          setSelectedVoiceUri(voice.voiceURI);
                          try { localStorage.setItem('av_tts_voice_uri', voice.voiceURI); } catch {}
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                          border: `1px solid ${isSelected ? '#C9A84C' : '#E8E4DC'}`,
                          background: isSelected ? 'rgba(201,168,76,0.08)' : '#fff',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{voice.name}</div>
                          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{voice.lang}</div>
                        </div>
                        {isSelected && <div style={{ fontSize: 12, color: '#C9A84C', fontWeight: 700, flexShrink: 0 }}>✓</div>}
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            if (isTesting) return;
                            setTestingVoice(voice.voiceURI);
                            TextToSpeech.speak({
                              text: 'Logging twenty five hundred dollars, confirm?',
                              lang: 'en-US', rate: 1.0, category: 'playback',
                              queueStrategy: QueueStrategy.Flush,
                              voice: voice.originalIndex,
                            }).catch(() => {}).finally(() => setTestingVoice(null));
                          }}
                          style={{
                            background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 6,
                            padding: '5px 10px', fontSize: 11, fontWeight: 600, color: '#0A1F44',
                            cursor: isTesting ? 'default' : 'pointer', flexShrink: 0,
                          }}
                        >
                          {isTesting ? '…' : 'Test'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}

        {tab === 'markup' && ['owner', 'project_manager'].includes(profile?.role) && <>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 14, lineHeight: 1.6 }}>
            Choose which markup rate each cost category uses. <strong>Flat</strong> = 0% (pass-through — permits, self-performed).
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Category</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Rate bucket</div>
            {[
              ['labor',     'Labor'],
              ['sub',       'Subcontractor'],
              ['materials', 'Materials'],
              ['equipment', 'Equipment'],
              ['permit',    'Permit / Fees'],
              ['other',     'Other'],
            ].map(([cat, label]) => (
              <Fragment key={cat}>
                <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{label}</div>
                <select
                  className="finp"
                  style={{ fontSize: 12, padding: '5px 7px' }}
                  value={markupCfg[cat] || 'material_rate'}
                  onChange={e => setMarkupCfg(m => ({ ...m, [cat]: e.target.value }))}
                >
                  <option value="labor_rate">Labor rate</option>
                  <option value="material_rate">Material rate</option>
                  <option value="flat">Flat (pass-through)</option>
                </select>
              </Fragment>
            ))}
          </div>
          {markupMsg && (
            <div style={{ fontSize: 12, padding: '6px 10px', borderRadius: 4, marginBottom: 10, background: markupMsg.startsWith('Error') ? '#FEE2E2' : '#D1FAE5', color: markupMsg.startsWith('Error') ? '#991b1b' : '#065f46' }}>
              {markupMsg}
            </div>
          )}
          <button className="btn btn-navy" style={{ width: '100%' }} onClick={saveMarkupConfig} disabled={markupSaving}>
            {markupSaving ? 'Saving…' : 'Save Markup Config'}
          </button>
        </>}

        {tab === 'quickbooks' && profile?.role === 'owner' && <>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 12, lineHeight: 1.6 }}>Map each transaction type to a QuickBooks account and class. Changes save on blur.</div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr 20px', gap: '5px 8px', alignItems: 'center', minWidth: 340 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Type</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>QB Account</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>QB Class</div>
              <div />
              {QB_TYPES.map(([type, label]) => {
                const row = qbMap[type] || { account: '', cls: '' };
                return (
                  <Fragment key={type}>
                    <div style={{ fontSize: 12, color: '#374151', fontWeight: 500, paddingRight: 4 }}>{label}</div>
                    <input className="finp" style={{ fontSize: 12, padding: '5px 7px' }} value={row.account} placeholder="Account" onChange={e => setQbMap(m => ({ ...m, [type]: { ...row, account: e.target.value } }))} onBlur={() => saveQbMapping(type)} />
                    <input className="finp" style={{ fontSize: 12, padding: '5px 7px' }} value={row.cls}     placeholder="Class"   onChange={e => setQbMap(m => ({ ...m, [type]: { ...row, cls: e.target.value } }))}     onBlur={() => saveQbMapping(type)} />
                    <div style={{ fontSize: 10, color: '#22c55e', textAlign: 'center' }}>{qbSaving === type ? '✓' : ''}</div>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </>}
      </div>
    </div>
  );
}
