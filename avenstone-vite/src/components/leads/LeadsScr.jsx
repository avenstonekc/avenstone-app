import { useState, useEffect } from 'react';
import { sbLoadContacts, sbUpdContact, sbDelContact, sbSaveContact, AV_TENANT } from '../../lib/supabase';

const STATUS_META = {
  new:       { bg: '#FEF3C7', color: '#92400E', lb: 'New' },
  contacted: { bg: '#DBEAFE', color: '#1E40AF', lb: 'Contacted' },
  qualified: { bg: '#D1FAE5', color: '#065F46', lb: 'Qualified' },
  customer:  { bg: '#E0E7FF', color: '#3730A3', lb: 'Won' },
  lost:      { bg: '#F3F4F6', color: '#6B7280', lb: 'Lost' },
};

export default function LeadsScr({ profile, onConvertToJob }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all');
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied]     = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const data = await sbLoadContacts();
    setContacts(data);
    setLoading(false);
  };

  const updateStatus = async (id, status) => {
    await sbUpdContact(id, { status });
    setContacts(p => p.map(c => c.id === id ? { ...c, status } : c));
  };

  const remove = async id => {
    if (!confirm('Delete this lead?')) return;
    await sbDelContact(id);
    setContacts(p => p.filter(c => c.id !== id));
  };

  const profileUrl = `${window.location.origin}?pro=${AV_TENANT}`;

  const networkCount = contacts.filter(c => c.source === 'network_profile').length;
  const newCount     = contacts.filter(c => c.status === 'new').length;

  const filtered = contacts.filter(c => {
    if (filter === 'network') return c.source === 'network_profile';
    if (filter === 'new')     return c.status === 'new';
    return true;
  });

  const displayName = c =>
    c.first_name && c.last_name ? `${c.first_name} ${c.last_name}` :
    c.first_name || c.name || 'Unknown';

  return (
    <div style={{ padding: '16px 20px', maxWidth: 920 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: '#0A1F44' }}>Leads</div>
          <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 2 }}>
            {contacts.length} total · {newCount} new · {networkCount} from network
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { navigator.clipboard.writeText(profileUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            style={{ fontSize: 12, fontWeight: 600, background: copied ? '#D1FAE5' : '#F7F5F0', color: copied ? '#065F46' : '#6B7280', border: '1px solid #E8E4DC', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>
            {copied ? '✓ Copied!' : '🔗 Share Profile'}
          </button>
          <button className="btn btn-navy" onClick={() => { setSelected(null); setShowModal(true); }}>+ Add Lead</button>
        </div>
      </div>

      {/* Network lead CTA (when no network leads yet) */}
      {networkCount === 0 && (
        <div style={{ background: 'linear-gradient(135deg, #0A1F44, #1a3a6e)', borderRadius: 10, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#C9A84C', marginBottom: 4 }}>Start getting network leads</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
              Share your public profile link and homeowners who request an estimate appear here automatically.
            </div>
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(profileUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            style={{ background: '#C9A84C', color: '#0A1F44', border: 'none', borderRadius: 6, padding: '10px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {copied ? '✓ Copied!' : 'Copy Profile Link'}
          </button>
        </div>
      )}

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          ['all',     `All (${contacts.length})`],
          ['network', `Network (${networkCount})`],
          ['new',     `New (${newCount})`],
        ].map(([v, lb]) => (
          <button key={v} onClick={() => setFilter(v)} style={{
            padding: '6px 14px', borderRadius: 20, border: '1px solid',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background:   filter === v ? '#0A1F44' : 'transparent',
            color:        filter === v ? '#C9A84C' : '#6B7280',
            borderColor:  filter === v ? '#0A1F44' : '#E8E4DC',
          }}>{lb}</button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>{filter === 'network' ? '🌐' : '📋'}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0A1F44', marginBottom: 6 }}>
            {filter === 'network' ? 'No network leads yet' : 'No leads'}
          </div>
          <div style={{ fontSize: 13, color: '#9CA3AF', maxWidth: 300, margin: '0 auto' }}>
            {filter === 'network'
              ? 'Share your profile link and homeowners who request an estimate will appear here.'
              : 'Add a lead manually or share your public profile link.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(c => {
            const st        = STATUS_META[c.status] || STATUS_META.new;
            const isNetwork = c.source === 'network_profile';
            return (
              <div key={c.id} style={{
                background: '#fff',
                border: `1px solid ${isNetwork ? '#FDE68A' : '#E8E4DC'}`,
                borderRadius: 8,
                padding: '14px 16px',
                position: 'relative',
                overflow: 'hidden',
              }}>
                {isNetwork && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#C9A84C,#F59E0B)' }} />
                )}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* Avatar */}
                  <div style={{
                    width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                    background: isNetwork ? '#FEF3C7' : '#F7F5F0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 17, fontWeight: 700,
                    color: isNetwork ? '#92400E' : '#0A1F44',
                  }}>
                    {displayName(c)[0].toUpperCase()}
                  </div>

                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, color: '#0A1F44', fontSize: 14 }}>{displayName(c)}</span>
                      {isNetwork && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Network Lead
                        </span>
                      )}
                      <span style={{ fontSize: 11, fontWeight: 600, background: st.bg, color: st.color, padding: '2px 8px', borderRadius: 10 }}>
                        {st.lb}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#6B7280', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {c.email && <span>✉ {c.email}</span>}
                      {c.phone && <span>📞 {c.phone}</span>}
                    </div>
                    {c.notes && (
                      <div style={{ fontSize: 12, color: '#374151', marginTop: 4, fontStyle: 'italic' }}>
                        "{c.notes.length > 100 ? c.notes.slice(0, 100) + '…' : c.notes}"
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                      {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {c.source && c.source !== 'manual' && ` · via ${c.source.replace(/_/g, ' ')}`}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                    <select
                      value={c.status || 'new'}
                      onChange={e => updateStatus(c.id, e.target.value)}
                      style={{ fontSize: 11, border: '1px solid #E8E4DC', borderRadius: 4, padding: '3px 6px', background: '#fff', cursor: 'pointer', color: '#374151' }}>
                      {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.lb}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {onConvertToJob && c.status !== 'lost' && (
                        <button
                          onClick={() => onConvertToJob(c)}
                          title="Convert to project"
                          style={{ fontSize: 10, fontWeight: 700, background: '#0A1F44', color: '#C9A84C', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}>
                          → Project
                        </button>
                      )}
                      <button
                        onClick={() => { setSelected(c); setShowModal(true); }}
                        style={{ fontSize: 10, fontWeight: 600, background: 'transparent', color: '#6B7280', border: '1px solid #E8E4DC', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}>
                        Edit
                      </button>
                      <button
                        onClick={() => remove(c.id)}
                        style={{ fontSize: 10, fontWeight: 600, background: 'transparent', color: '#EF4444', border: '1px solid #FECACA', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}>
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <LeadModal
          contact={selected}
          onClose={() => { setShowModal(false); setSelected(null); }}
          onSaved={load}
        />
      )}
    </div>
  );
}

function LeadModal({ contact, onClose, onSaved }) {
  const [form, setForm] = useState({
    first_name: contact?.first_name || contact?.name || '',
    last_name:  contact?.last_name  || '',
    email:      contact?.email      || '',
    phone:      contact?.phone      || '',
    notes:      contact?.notes      || '',
    status:     contact?.status     || 'new',
    source:     contact?.source     || 'manual',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.first_name.trim()) return;
    setSaving(true);
    if (contact?.id) {
      await sbUpdContact(contact.id, form);
    } else {
      await sbSaveContact(form);
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 17, color: '#0A1F44' }}>
            {contact ? 'Edit Lead' : 'New Lead'}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 18 }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div className="fg">
            <label className="flbl">First Name *</label>
            <input className="finp" value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="flbl">Last Name</label>
            <input className="finp" value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} />
          </div>
        </div>
        <div className="fg">
          <label className="flbl">Email</label>
          <input className="finp" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
        </div>
        <div className="fg">
          <label className="flbl">Phone</label>
          <input className="finp" type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="(816) 555-0000" />
        </div>
        <div className="fg">
          <label className="flbl">Notes / Project Interest</label>
          <textarea className="finp" rows={3} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="What are they looking to build or remodel?" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div className="fg">
            <label className="flbl">Status</label>
            <select className="finp" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.lb}</option>)}
            </select>
          </div>
          <div className="fg">
            <label className="flbl">Source</label>
            <select className="finp" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))}>
              {['manual','website','referral','facebook','instagram','google','network_profile','ghl','other'].map(s => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-navy" style={{ flex: 1 }} onClick={save} disabled={saving || !form.first_name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
