import { useState, useEffect } from 'react';
import { sbLoadTeam, sbInviteStaff, sbSetUserActive, sbSetUserRole, sbSaveCommission, STAFF_ROLES, ROLE_LABELS } from '../../lib/supabase';
import { Ic } from '../../lib/utils';
import EmployeeModal from './EmployeeModal';

const SEL_STYLE = { appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32 };

export default function UserMgmt() {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'sales_rep' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [editRole, setEditRole] = useState(null);
  const [commEdit, setCommEdit] = useState(null);
  const [empModal, setEmpModal] = useState(null); // { mode:'add' } | { mode:'detail', user }

  useEffect(() => { sbLoadTeam().then(d => { setTeam(d); setLoading(false); }); }, []);

  const invite = async () => {
    if (!form.name.trim() || !form.email.trim()) { setErr('Name and email required.'); return; }
    setSaving(true); setErr('');
    try {
      const res = await sbInviteStaff(form.name.trim(), form.email.trim(), form.role);
      if (res.error) { setErr(res.error); setSaving(false); return; }
      setTeam(await sbLoadTeam());
      setForm({ name: '', email: '', role: 'sales_rep' }); setShowAdd(false);
    } catch (e) { setErr(e?.message || 'Something went wrong — check that the send-invite function is deployed'); }
    setSaving(false);
  };

  const toggleActive = async u => {
    const r = await sbSetUserActive(u.id, !u.is_active);
    if (r.ok) setTeam(p => p.map(x => x.id === u.id ? { ...x, is_active: !u.is_active } : x));
    else setErr(r.error || 'Update failed');
  };

  const saveRole = async () => {
    if (!editRole) return;
    const r = await sbSetUserRole(editRole.id, editRole.role);
    if (r.ok) { setTeam(p => p.map(x => x.id === editRole.id ? { ...x, role: editRole.role } : x)); setEditRole(null); }
    else setErr(r.error || 'Save failed');
  };

  const saveComm = async () => {
    if (!commEdit) return;
    const r = await sbSaveCommission(commEdit.id, commEdit.pct, commEdit.dollar);
    if (r.ok) { setTeam(p => p.map(x => x.id === commEdit.id ? { ...x, commission_pct: Number(commEdit.pct) || 0, commission_dollar: Number(commEdit.dollar) || 0 } : x)); setCommEdit(null); }
    else setErr(r.error || 'Save failed');
  };

  return (
    <div style={{ padding: 20, maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: '#0A1F44' }}>Team</div>
          <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 2 }}>Manage staff access and roles</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setEmpModal({ mode: 'add' })}>
            <span style={{ width: 14, height: 14 }}>{Ic.plus}</span>Add Employee
          </button>
          <button className="btn btn-navy" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowAdd(true)}>
            <span style={{ width: 14, height: 14 }}>{Ic.plus}</span>Invite Member
          </button>
        </div>
      </div>
      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Loading...</div>}
      {team.map(u => (
        <div key={u.id} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '14px 16px', marginBottom: 8, opacity: u.is_active ? 1 : 0.55 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, background: '#0A1F4418', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#0A1F44', flexShrink: 0 }}>{(u.full_name || u.email || '?')[0].toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0A1F44' }}>{u.full_name || u.email}</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{u.email}</div>
            </div>
            {editRole?.id === u.id ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select className="finp" style={{ ...SEL_STYLE, padding: '6px 32px 6px 10px', fontSize: 12, height: 32, marginBottom: 0 }} value={editRole.role} onChange={e => setEditRole(p => ({ ...p, role: e.target.value }))}>
                  {STAFF_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <button className="btn btn-gold" style={{ padding: '5px 12px', fontSize: 11 }} onClick={saveRole}>Save</button>
                <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => setEditRole(null)}>✕</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, background: '#0A1F4412', color: '#0A1F44', padding: '3px 10px', fontWeight: 600, cursor: 'pointer' }} onClick={() => setEditRole({ id: u.id, role: u.role })} title="Click to change role">{ROLE_LABELS[u.role] || u.role}</span>
                <button onClick={() => toggleActive(u)} style={{ background: u.is_active ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${u.is_active ? '#FECACA' : '#BBF7D0'}`, color: u.is_active ? '#ef4444' : '#16a34a', padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{u.is_active ? 'Deactivate' : 'Reactivate'}</button>
              </div>
            )}
          </div>
          {u.role === 'sales_rep' && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F3F0EB' }}>
              {commEdit?.id === u.id ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, color: '#6B7280' }}>Commission %</span>
                    <input type="number" min="0" max="100" step="0.1" style={{ width: 70, padding: '4px 8px', border: '1px solid #E8E4DC', fontSize: 12, borderRadius: 4 }} value={commEdit.pct} onChange={e => setCommEdit(p => ({ ...p, pct: e.target.value }))} placeholder="0" />
                  </div>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>or</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, color: '#6B7280' }}>Flat $ per job</span>
                    <input type="number" min="0" step="1" style={{ width: 80, padding: '4px 8px', border: '1px solid #E8E4DC', fontSize: 12, borderRadius: 4 }} value={commEdit.dollar} onChange={e => setCommEdit(p => ({ ...p, dollar: e.target.value }))} placeholder="0" />
                  </div>
                  <button className="btn btn-gold" style={{ padding: '4px 12px', fontSize: 11 }} onClick={saveComm}>Save</button>
                  <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setCommEdit(null)}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>Commission:</span>
                  {Number(u.commission_pct || 0) > 0
                    ? <span style={{ fontSize: 11, fontWeight: 700, color: '#C9A84C' }}>{u.commission_pct}%</span>
                    : Number(u.commission_dollar || 0) > 0
                    ? <span style={{ fontSize: 11, fontWeight: 700, color: '#C9A84C' }}>${u.commission_dollar} flat</span>
                    : <span style={{ fontSize: 11, color: '#9CA3AF' }}>Not set</span>}
                  <button onClick={() => setCommEdit({ id: u.id, pct: u.commission_pct || '', dollar: u.commission_dollar || '' })} style={{ background: 'none', border: 'none', fontSize: 11, color: '#C9A84C', cursor: 'pointer', fontWeight: 600, padding: 0 }}>Edit</button>
                </div>
              )}
            </div>
          )}
          {u.role === 'crew' && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F3F0EB', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>Hourly employee</span>
              <button onClick={() => setEmpModal({ mode: 'detail', user: u })} style={{ background: 'none', border: 'none', fontSize: 11, color: '#C9A84C', cursor: 'pointer', fontWeight: 600, padding: 0 }}>Pay & details →</button>
            </div>
          )}
        </div>
      ))}
      {empModal && (
        <EmployeeModal
          mode={empModal.mode}
          user={empModal.user}
          onClose={() => setEmpModal(null)}
          onSaved={async () => { setTeam(await sbLoadTeam()); setEmpModal(null); }}
        />
      )}
      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Invite Team Member</div>
            {[['name', 'Full Name', 'Jane Smith', true], ['email', 'Email', 'jane@avenstonekc.com', true]].map(([k, lb, ph, req]) => (
              <div className="fg" key={k}>
                <label className="flbl">{req && <span className="freq">*</span>}{lb}</label>
                <input className="finp" value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} placeholder={ph} />
              </div>
            ))}
            <div className="fg">
              <label className="flbl"><span className="freq">*</span>Role</label>
              <select className="finp" style={SEL_STYLE} value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                {STAFF_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '8px 12px', fontSize: 12, marginBottom: 10 }}>{err}</div>}
            <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12, lineHeight: 1.6 }}>They'll receive an invite email with a magic link to set up their account.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setShowAdd(false); setErr(''); }}>Cancel</button>
              <button className={`btn ${form.name && form.email ? 'btn-navy' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={invite} disabled={saving || !form.name || !form.email}>{saving ? 'Sending...' : 'Send Invite'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
