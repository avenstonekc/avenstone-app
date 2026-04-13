import { useState, useEffect, useRef } from 'react';
import { sb, AV_TENANT, AV_USER_ID, ANON_KEY } from '../../lib/supabase';
import { Ic, isMob } from '../../lib/utils';

const FN = 'https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1';
const authHdr = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` });

const STATUS_COLORS = { new: '#3B82F6', contacted: '#f59e0b', qualified: '#8b5cf6', customer: '#22c55e', lost: '#9CA3AF' };
const STATUS_LABELS = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', customer: 'Customer', lost: 'Lost' };
const SOURCES = ['manual', 'website', 'referral', 'facebook', 'instagram', 'google', 'ghl', 'other'];
const STATUSES = ['new', 'contacted', 'qualified', 'customer', 'lost'];

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || '#9CA3AF';
  const label = STATUS_LABELS[status] || status;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 20,
      background: color + '18', color, fontSize: 11, fontWeight: 600
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

function Avatar({ contact }) {
  const initials = ((contact.first_name?.[0] || '') + (contact.last_name?.[0] || '')).toUpperCase() || '?';
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', background: '#0A1F44', color: '#C9A84C',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, fontWeight: 700, flexShrink: 0
    }}>
      {initials}
    </div>
  );
}

function formatTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ContactsScr({ profile }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    source: 'manual', assigned_rep: '', status: 'new', notes: ''
  });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef(null);
  const mobile = isMob();

  async function loadContacts() {
    setLoading(true);
    const { data, error } = await sb
      .from('contacts')
      .select('*')
      .eq('tenant_id', AV_TENANT)
      .order('created_at', { ascending: false });
    if (!error) setContacts(data || []);
    setLoading(false);
  }

  async function loadMessages(contactId) {
    setMsgLoading(true);
    const { data, error } = await sb
      .from('contact_messages')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true });
    if (!error) setMessages(data || []);
    setMsgLoading(false);
  }

  useEffect(() => { loadContacts(); }, []);

  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    loadMessages(selected.id);
    const ch = sb.channel('cms-' + selected.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'contact_messages', filter: `contact_id=eq.${selected.id}`
      }, p => setMessages(prev => [...prev, p.new]))
      .subscribe();
    return () => sb.removeChannel(ch);
  }, [selected]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  async function saveContact() {
    setSaving(true);
    const { data, error } = await sb
      .from('contacts')
      .insert({ ...addForm, tenant_id: AV_TENANT, created_at: new Date().toISOString() })
      .select()
      .single();
    setSaving(false);
    if (error) { alert('Error saving contact: ' + error.message); return; }
    await loadContacts();
    setShowAdd(false);
    setAddForm({ first_name: '', last_name: '', email: '', phone: '', source: 'manual', assigned_rep: '', status: 'new', notes: '' });
    if (data) setSelected(data);
  }

  async function updateContact() {
    setSaving(true);
    const { error } = await sb
      .from('contacts')
      .update(editData)
      .eq('id', selected.id);
    setSaving(false);
    if (error) { alert('Error updating contact: ' + error.message); return; }
    setContacts(prev => prev.map(c => c.id === selected.id ? { ...c, ...editData } : c));
    setSelected(prev => ({ ...prev, ...editData }));
    setEditing(false);
  }

  async function sendSms() {
    if (!newMsg.trim() || !selected?.phone) return;
    const optimistic = {
      id: 'opt-' + Date.now(), contact_id: selected.id,
      body: newMsg, direction: 'outbound', created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, optimistic]);
    const body = newMsg;
    setNewMsg('');
    setSending(true);
    try {
      const res = await fetch(`${FN}/send-contact-sms`, {
        method: 'POST',
        headers: authHdr(),
        body: JSON.stringify({ contact_id: selected.id, body, tenant_id: AV_TENANT })
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      alert('Error sending SMS: ' + e.message);
    }
    setSending(false);
  }

  async function deleteContact() {
    if (!window.confirm(`Delete ${selected.first_name} ${selected.last_name}? This cannot be undone.`)) return;
    const { error } = await sb.from('contacts').delete().eq('id', selected.id);
    if (error) { alert('Error deleting contact: ' + error.message); return; }
    setSelected(null);
    setEditing(false);
    await loadContacts();
  }

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || [c.first_name, c.last_name, c.email, c.phone]
      .some(v => v && v.toLowerCase().includes(q));
    const matchStatus = !statusFilter || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const showList = !mobile || !selected;
  const showDetail = !mobile || !!selected;

  // ── Left Panel ────────────────────────────────────────────────────────────
  const leftPanel = (
    <div style={{
      width: mobile ? '100%' : 320, minWidth: mobile ? undefined : 320,
      background: '#fff', borderRight: mobile ? 'none' : '1px solid #E8E4DC',
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18, color: '#0A1F44', flex: 1 }}>
          Contacts
        </span>
        <span style={{
          background: '#F7F5F0', color: '#0A1F44', fontSize: 11, fontWeight: 700,
          borderRadius: 10, padding: '2px 7px', marginRight: 4
        }}>{contacts.length}</span>
        <button className="btn btn-gold" style={{ fontSize: 12, padding: '5px 12px', whiteSpace: 'nowrap' }}
          onClick={() => setShowAdd(true)}>
          + Add
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 12px 0' }}>
        <input
          className="finp"
          placeholder="Search contacts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </div>

      {/* Status filter pills */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 12px', overflowX: 'auto', flexShrink: 0 }}>
        {[{ key: '', label: 'All' }, ...STATUSES.map(s => ({ key: s, label: STATUS_LABELS[s] }))].map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px',
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', borderRadius: 0,
            color: statusFilter === f.key ? '#C9A84C' : '#6B7280',
            borderBottom: statusFilter === f.key ? '2px solid #C9A84C' : '2px solid transparent'
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Contact List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
            {contacts.length === 0 ? 'No contacts yet. Add your first contact.' : 'No contacts match your search.'}
          </div>
        ) : filtered.map(c => {
          const isSelected = selected?.id === c.id;
          return (
            <div key={c.id} onClick={() => { setSelected(c); setEditing(false); }}
              style={{
                padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: '1px solid #F3F0EB',
                background: isSelected ? '#F7F5F0' : '#fff',
                borderLeft: isSelected ? '3px solid #C9A84C' : '3px solid transparent',
                transition: 'background 0.15s'
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#F7F5F0'; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = '#fff'; }}
            >
              <Avatar contact={c} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.first_name} {c.last_name}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.phone || c.email || '—'}
                </div>
                <div style={{ marginTop: 3 }}>
                  <StatusBadge status={c.status} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Right Panel ───────────────────────────────────────────────────────────
  const rightPanel = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F7F5F0', height: '100%', overflow: 'hidden', minWidth: 0 }}>
      {!selected ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', gap: 12 }}>
          <Ic name="people" size={48} color="#D1C9B8" />
          <div style={{ fontSize: 15, fontWeight: 500 }}>Select a contact to view details</div>
        </div>
      ) : (
        <>
          {/* Detail Header */}
          <div style={{
            background: '#fff', borderBottom: '1px solid #E8E4DC',
            padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0
          }}>
            {mobile && (
              <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 13 }}
                onClick={() => { setSelected(null); setEditing(false); }}>
                ← Back
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 20, color: '#0A1F44', marginRight: 10 }}>
                {selected.first_name} {selected.last_name}
              </span>
              <StatusBadge status={selected.status} />
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 13 }}
              onClick={() => { setEditing(true); setEditData({ ...selected }); }}>
              Edit
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 13, color: '#ef4444' }}
              onClick={deleteContact}>
              Delete
            </button>
          </div>

          {/* Detail Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Contact Info Card */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 16, color: '#0A1F44' }}>Contact Info</span>
                {!editing && (
                  <button className="btn btn-ghost" style={{ fontSize: 12 }}
                    onClick={() => { setEditing(true); setEditData({ ...selected }); }}>
                    Edit
                  </button>
                )}
              </div>

              {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      { key: 'first_name', label: 'First Name' },
                      { key: 'last_name', label: 'Last Name' },
                      { key: 'email', label: 'Email', type: 'email' },
                      { key: 'phone', label: 'Phone', type: 'tel' },
                      { key: 'assigned_rep', label: 'Assigned Rep' },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{f.label}</label>
                        <input className="finp" type={f.type || 'text'} value={editData[f.key] || ''}
                          onChange={e => setEditData(p => ({ ...p, [f.key]: e.target.value }))}
                          style={{ width: '100%', boxSizing: 'border-box' }} />
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Source</label>
                      <select className="finp" value={editData.source || 'manual'}
                        onChange={e => setEditData(p => ({ ...p, source: e.target.value }))}
                        style={{ width: '100%', boxSizing: 'border-box' }}>
                        {SOURCES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</label>
                      <select className="finp" value={editData.status || 'new'}
                        onChange={e => setEditData(p => ({ ...p, status: e.target.value }))}
                        style={{ width: '100%', boxSizing: 'border-box' }}>
                        {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Notes</label>
                    <textarea className="finp" rows={3} value={editData.notes || ''}
                      onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))}
                      style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                    <button className="btn btn-gold" onClick={updateContact} disabled={saving}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px 24px' }}>
                  {[
                    { label: 'Name', value: `${selected.first_name || ''} ${selected.last_name || ''}`.trim() || '—' },
                    { label: 'Email', value: selected.email || '—' },
                    { label: 'Phone', value: selected.phone || '—' },
                    { label: 'Source', value: selected.source ? selected.source.charAt(0).toUpperCase() + selected.source.slice(1) : '—' },
                    { label: 'Assigned Rep', value: selected.assigned_rep || '—' },
                    { label: 'Status', value: null, badge: selected.status },
                    { label: 'Created', value: selected.created_at ? new Date(selected.created_at).toLocaleDateString() : '—' },
                  ].map(f => (
                    <div key={f.label}>
                      <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{f.label}</div>
                      {f.badge ? <StatusBadge status={f.badge} /> : <div style={{ fontSize: 14, color: '#0A1F44', fontWeight: 500 }}>{f.value}</div>}
                    </div>
                  ))}
                  {selected.notes && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Notes</div>
                      <div style={{ fontSize: 14, color: '#0A1F44', whiteSpace: 'pre-wrap' }}>{selected.notes}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SMS Thread Card */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #E8E4DC', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 16, color: '#0A1F44', flex: 1 }}>Text Messages</span>
                {selected.phone && <span style={{ fontSize: 12, color: '#9CA3AF' }}>{selected.phone}</span>}
              </div>

              {!selected.phone ? (
                <div style={{ padding: 20, color: '#f59e0b', fontSize: 13, background: '#fffbeb', margin: 12, borderRadius: 8, border: '1px solid #fde68a' }}>
                  Add a phone number to send SMS messages.
                </div>
              ) : (
                <>
                  <div style={{ maxHeight: 400, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {msgLoading ? (
                      <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: 16 }}>Loading messages...</div>
                    ) : messages.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: 16 }}>
                        No messages yet. Send the first one below.
                      </div>
                    ) : messages.map((m, i) => {
                      const out = m.direction === 'outbound';
                      return (
                        <div key={m.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: out ? 'flex-end' : 'flex-start' }}>
                          <div style={{
                            maxWidth: '75%', padding: '8px 12px',
                            background: out ? '#0A1F44' : '#F3F0EB',
                            color: out ? '#fff' : '#0A1F44',
                            borderRadius: out ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                            fontSize: 14, lineHeight: 1.4
                          }}>
                            {m.body}
                          </div>
                          <span style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{formatTs(m.created_at)}</span>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  <div style={{ padding: '12px 12px 16px', borderTop: '1px solid #E8E4DC', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <textarea
                      className="finp"
                      rows={2}
                      placeholder="Type a message..."
                      value={newMsg}
                      onChange={e => setNewMsg(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSms(); } }}
                      style={{ flex: 1, resize: 'none', boxSizing: 'border-box' }}
                    />
                    <button className="btn btn-navy" onClick={sendSms} disabled={sending || !newMsg.trim()}
                      style={{ alignSelf: 'flex-end', padding: '8px 16px', flexShrink: 0 }}>
                      {sending ? '...' : 'Send'}
                    </button>
                  </div>
                </>
              )}
            </div>

          </div>
        </>
      )}
    </div>
  );

  // ── Add Contact Modal ─────────────────────────────────────────────────────
  const addModal = showAdd && (
    <div className="overlay" onClick={() => setShowAdd(false)}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: '95%' }}>
        <div className="modal-title">New Contact</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: 4 }}>First Name</label>
              <input className="finp" value={addForm.first_name} placeholder="First name"
                onChange={e => setAddForm(p => ({ ...p, first_name: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: 4 }}>Last Name</label>
              <input className="finp" value={addForm.last_name} placeholder="Last name"
                onChange={e => setAddForm(p => ({ ...p, last_name: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: 4 }}>Email</label>
              <input className="finp" type="email" value={addForm.email} placeholder="Email"
                onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label>
              <input className="finp" type="tel" value={addForm.phone} placeholder="Phone"
                onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: 4 }}>Source</label>
              <select className="finp" value={addForm.source}
                onChange={e => setAddForm(p => ({ ...p, source: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box' }}>
                {SOURCES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: 4 }}>Assigned Rep</label>
              <input className="finp" value={addForm.assigned_rep} placeholder="Rep name"
                onChange={e => setAddForm(p => ({ ...p, assigned_rep: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: 4 }}>Status</label>
              <select className="finp" value={addForm.status}
                onChange={e => setAddForm(p => ({ ...p, status: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box' }}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
              <textarea className="finp" rows={3} value={addForm.notes} placeholder="Notes..."
                onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)} disabled={saving}>Cancel</button>
            <button className="btn btn-gold" onClick={saveContact} disabled={saving}>
              {saving ? 'Saving...' : 'Save Contact'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', fontFamily: 'DM Sans, sans-serif' }}>
      {showList && leftPanel}
      {showDetail && rightPanel}
      {addModal}
    </div>
  );
}
