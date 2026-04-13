import { useState, useEffect } from 'react';
import { sb, AV_TENANT } from '../../lib/supabase';
import { Ic } from '../../lib/utils';

const NAV   = '#0A1F44';
const GOLD  = '#C9A84C';
const BORDER = '#E8E4DC';
const CREAM = '#F7F5F0';

const CATEGORIES = [
  { id: 'all',          lb: 'All' },
  { id: 'pricing',      lb: 'Pricing' },
  { id: 'scheduling',   lb: 'Scheduling' },
  { id: 'trades',       lb: 'Trades' },
  { id: 'materials',    lb: 'Materials' },
  { id: 'client_comms', lb: 'Client Comms' },
  { id: 'process',      lb: 'Process' },
  { id: 'general',      lb: 'General' },
];

const CAT_COLORS = {
  pricing:      { bg: '#EFF6FF', text: '#1D4ED8' },
  scheduling:   { bg: '#F0FDF4', text: '#15803D' },
  trades:       { bg: '#FFF7ED', text: '#C2410C' },
  materials:    { bg: '#FAF5FF', text: '#7C3AED' },
  client_comms: { bg: '#FFF1F2', text: '#BE123C' },
  process:      { bg: '#F0F9FF', text: '#0369A1' },
  general:      { bg: '#F9FAFB', text: '#374151' },
};

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
        background: value ? NAV : '#D1D5DB',
        position: 'relative', flexShrink: 0, transition: 'background 0.2s',
        padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: value ? 20 : 3,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

export default function AiKnowledgeScr({ profile }) {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [catFilter, setCatFilter] = useState('all');
  const [showAdd, setShowAdd]   = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm]         = useState({ category: 'pricing', content: '' });
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');
  const [deleting, setDeleting] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await sb.from('ai_knowledge')
      .select('*')
      .eq('tenant_id', AV_TENANT)
      .order('created_at', { ascending: false });
    setItems(data || []);
    setLoading(false);
  };

  const openAdd = () => {
    setEditItem(null);
    setForm({ category: 'pricing', content: '' });
    setErr('');
    setShowAdd(true);
  };

  const openEdit = item => {
    setEditItem(item);
    setForm({ category: item.category, content: item.content });
    setErr('');
    setShowAdd(true);
  };

  const save = async () => {
    if (!form.content.trim()) { setErr('Content is required'); return; }
    setSaving(true);
    setErr('');
    try {
      if (editItem) {
        const { error } = await sb.from('ai_knowledge')
          .update({ category: form.category, content: form.content.trim() })
          .eq('id', editItem.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from('ai_knowledge')
          .insert({
            tenant_id:  AV_TENANT,
            category:   form.category,
            content:    form.content.trim(),
            active:     true,
            created_by: profile?.id ?? null,
          });
        if (error) throw error;
      }
      await load();
      setShowAdd(false);
    } catch (e) {
      setErr(e.message);
    }
    setSaving(false);
  };

  const toggleActive = async (item) => {
    const next = !item.active;
    setItems(p => p.map(x => x.id === item.id ? { ...x, active: next } : x));
    await sb.from('ai_knowledge').update({ active: next }).eq('id', item.id);
  };

  const del = async (id) => {
    setDeleting(id);
    await sb.from('ai_knowledge').delete().eq('id', id);
    setItems(p => p.filter(x => x.id !== id));
    setDeleting(null);
  };

  const filtered = catFilter === 'all' ? items : items.filter(x => x.category === catFilter);
  const activeCount = items.filter(x => x.active).length;

  return (
    <div style={{ padding: '20px 24px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: NAV, lineHeight: 1.2 }}>AI Knowledge Base</div>
          <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4 }}>
            Teach the AI about your company — injected into every conversation.
            <span style={{ marginLeft: 8, background: '#D1FAE5', color: '#065F46', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
              {activeCount} active {activeCount === 1 ? 'entry' : 'entries'}
            </span>
          </div>
        </div>
        <button
          onClick={openAdd}
          className="btn btn-navy"
          style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
        >
          <span style={{ width: 14, height: 14, display: 'flex' }}>{Ic.plus}</span>
          Add Knowledge
        </button>
      </div>

      {/* Info banner */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '10px 14px', marginBottom: 20, fontSize: 12.5, color: '#1E40AF', lineHeight: 1.5 }}>
        <strong>How it works:</strong> Active entries are injected into the AI companion's system prompt for every job conversation. Use this to teach the AI your pricing model, preferred subs, scheduling norms, and how you communicate with clients.
      </div>

      {/* Category filter pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {CATEGORIES.map(c => {
          const count = c.id === 'all' ? items.length : items.filter(x => x.category === c.id).length;
          return (
            <button
              key={c.id}
              onClick={() => setCatFilter(c.id)}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                border: `1px solid ${catFilter === c.id ? NAV : BORDER}`,
                background: catFilter === c.id ? NAV : '#fff',
                color: catFilter === c.id ? '#fff' : '#6B7280',
                transition: 'all 0.15s',
              }}
            >
              {c.lb} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF', fontSize: 14 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF', fontSize: 14 }}>
          {catFilter === 'all' ? 'No knowledge entries yet. Add your first one.' : `No entries in this category.`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(item => {
            const cat = CAT_COLORS[item.category] || CAT_COLORS.general;
            const catLabel = CATEGORIES.find(c => c.id === item.category)?.lb || item.category;
            return (
              <div
                key={item.id}
                style={{
                  background: '#fff',
                  border: `1px solid ${item.active ? BORDER : '#F3F4F6'}`,
                  borderRadius: 8,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  opacity: item.active ? 1 : 0.55,
                  transition: 'opacity 0.2s',
                }}
              >
                {/* Active toggle */}
                <div style={{ paddingTop: 2 }}>
                  <Toggle value={item.active} onChange={() => toggleActive(item)} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: cat.bg, color: cat.text, textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>
                      {catLabel}
                    </span>
                    {!item.active && (
                      <span style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>inactive — not injected into AI</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {item.content}
                  </div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
                    Added {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => openEdit(item)}
                    style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, cursor: 'pointer', color: '#6B7280', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6 }}
                    title="Edit"
                  >
                    <span style={{ width: 14, height: 14, display: 'flex' }}>{Ic.edit}</span>
                  </button>
                  <button
                    onClick={() => del(item.id)}
                    disabled={deleting === item.id}
                    style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, cursor: 'pointer', color: '#EF4444', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6 }}
                    title="Delete"
                  >
                    <span style={{ width: 14, height: 14, display: 'flex' }}>{Ic.trash}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: '100%' }}>
            <div className="modal-title" style={{ marginBottom: 18 }}>
              {editItem ? 'Edit Knowledge Entry' : 'Add Knowledge Entry'}
            </div>

            <div className="fg" style={{ marginBottom: 14 }}>
              <label className="flbl">Category</label>
              <select
                className="finp"
                value={form.category}
                onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              >
                {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                  <option key={c.id} value={c.id}>{c.lb}</option>
                ))}
              </select>
            </div>

            <div className="fg" style={{ marginBottom: 14 }}>
              <label className="flbl">
                Content <span style={{ color: '#EF4444' }}>*</span>
                <span style={{ fontWeight: 400, color: '#9CA3AF', marginLeft: 6 }}>— write in plain English, the AI reads this directly</span>
              </label>
              <textarea
                className="finp"
                rows={5}
                style={{ resize: 'vertical', fontFamily: "'DM Sans',sans-serif", lineHeight: 1.6, fontSize: 13.5 }}
                placeholder={
                  form.category === 'pricing'      ? 'e.g. Our standard markup on materials is 25%. Labor rate is $85/hr for most trades.' :
                  form.category === 'scheduling'   ? 'e.g. We typically need 2 weeks lead time after signing before demo starts.' :
                  form.category === 'trades'       ? 'e.g. We use Johnson Electric for all electrical work. Contact: Mike J. 555-0100.' :
                  form.category === 'client_comms' ? 'e.g. Always send a weekly update text to clients on Fridays before noon.' :
                  form.category === 'process'      ? 'e.g. All change orders must be signed before any additional work begins.' :
                  'Enter knowledge for the AI to learn...'
                }
                value={form.content}
                onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                autoFocus
              />
            </div>

            {err && (
              <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', fontSize: 12.5, borderRadius: 4, marginBottom: 12, border: '1px solid #FECACA' }}>
                {err}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <button
                className="btn btn-navy"
                style={{ flex: 1 }}
                onClick={save}
                disabled={saving || !form.content.trim()}
              >
                {saving ? 'Saving…' : editItem ? 'Save Changes' : 'Add to AI'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
