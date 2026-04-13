import { useState, useEffect } from 'react';
import { sb, sbLoadSubDirectory, sbInviteSub, AV_TENANT } from '../../lib/supabase';
import { Ic } from '../../lib/utils';
import StarRating from '../shared/StarRating';
import SubRateModal from './SubRateModal';
import SubOnboardingModal from './SubOnboardingModal';

export default function SubDir({ profile }) {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', trade: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ratingSub, setRatingSub] = useState(null);
  const [onboardingSub, setOnboardingSub] = useState(null);
  const [avgMap, setAvgMap] = useState({});

  useEffect(() => {
    sbLoadSubDirectory().then(async d => {
      setSubs(d); setLoading(false);
      const { data } = await sb.from('sub_ratings').select('sub_id,stars').eq('tenant_id', AV_TENANT);
      if (data) {
        const map = {};
        data.forEach(r => { if (!map[r.sub_id]) map[r.sub_id] = { sum: 0, cnt: 0 }; map[r.sub_id].sum += r.stars; map[r.sub_id].cnt += 1; });
        setAvgMap(map);
      }
    });
  }, []);

  const addSub = async () => {
    if (!form.name.trim() || !form.email.trim()) { setErr('Name and email are required.'); return; }
    setSaving(true); setErr('');
    const res = await sbInviteSub(form.name.trim(), form.email.trim(), form.trade.trim(), form.phone.trim());
    if (res.error) { setErr(res.error); setSaving(false); return; }
    setSubs(await sbLoadSubDirectory());
    setForm({ name: '', email: '', trade: '', phone: '' });
    setShowAdd(false); setSaving(false);
  };

  const isOwnerOrMgr = profile && ['owner', 'sales_rep', 'project_manager'].includes(profile.role);
  const canRate = profile && ['client', 'sales_rep', 'owner'].includes(profile.role);

  return (
    <div style={{ padding: 20, maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div><div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: '#0A1F44' }}>Sub Directory</div><div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 2 }}>Contractors and subcontractors</div></div>
        {isOwnerOrMgr && <button className="btn btn-navy" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowAdd(true)}><span style={{ width: 14, height: 14 }}>{Ic.plus}</span>Add Sub</button>}
      </div>
      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Loading...</div>}
      {!loading && !subs.length && <div className="empty">{Ic.home}<div className="empty-t">No subs yet</div><div>Add your first subcontractor above</div></div>}
      {subs.map(s => {
        const rt = avgMap[s.id];
        const avg = rt ? rt.sum / rt.cnt : 0;
        return (
          <div key={s.id} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '14px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, background: '#0A1F4418', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#0A1F44', flexShrink: 0 }}>{(s.full_name || s.email || '?')[0].toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0A1F44' }}>{s.full_name || s.email}</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                {s.trade && <span>{s.trade}</span>}
                {s.email && <span>{s.email}</span>}
                {s.phone && <span>{s.phone}</span>}
              </div>
              {rt && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <StarRating value={Math.round(avg)} readonly size={13} />
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>{avg.toFixed(1)} ({rt.cnt})</span>
              </div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <span style={{ fontSize: 10, background: s.is_active ? '#F0FDF4' : '#F7F5F0', color: s.is_active ? '#16a34a' : '#9CA3AF', padding: '3px 10px', border: `1px solid ${s.is_active ? '#BBF7D0' : '#E8E4DC'}`, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.is_active ? 'Active' : 'Inactive'}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {isOwnerOrMgr && <button onClick={() => setOnboardingSub(s)} style={{ background: 'transparent', border: '1px solid #C9A84C', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#C9A84C', fontWeight: 600 }}>Onboarding</button>}
                <button onClick={() => setRatingSub(s)} style={{ background: 'transparent', border: '1px solid #E8E4DC', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: canRate ? '#C9A84C' : '#9CA3AF', fontWeight: 600 }}>{canRate ? 'Rate / Reviews' : 'Reviews'}</button>
              </div>
            </div>
          </div>
        );
      })}
      {showAdd && <div className="overlay" onClick={() => setShowAdd(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-title">Add Subcontractor</div>
          {[['name', 'Full Name', 'John Smith', true], ['email', 'Email', 'john@smithelectric.com', true], ['trade', 'Trade / Specialty', 'Electrical'], ['phone', 'Phone', '(816) 555-1234']].map(([k, lb, ph, req]) => (
            <div className="fg" key={k}><label className="flbl">{req && <span className="freq">*</span>}{lb}</label><input className="finp" value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} placeholder={ph} /></div>
          ))}
          {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '8px 12px', fontSize: 12, marginBottom: 10 }}>{err}</div>}
          <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12, lineHeight: 1.6 }}>An invite link will be emailed to this sub so they can log in and view their assigned jobs, upload photos, and send messages.</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setShowAdd(false); setErr(''); }}>Cancel</button>
            <button className={`btn ${form.name && form.email ? 'btn-navy' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={addSub} disabled={saving || !form.name || !form.email}>{saving ? 'Sending invite...' : 'Add & Send Invite'}</button>
          </div>
        </div>
      </div>}
      {ratingSub && <SubRateModal sub={ratingSub} onClose={() => setRatingSub(null)} profile={profile} />}
      {onboardingSub && <SubOnboardingModal sub={onboardingSub} onClose={() => setOnboardingSub(null)} onUpdated={updated => { setSubs(ss => ss.map(s => s.id === updated.id ? updated : s)); setOnboardingSub(updated); }} />}
    </div>
  );
}
