import { useState, useEffect } from 'react';
import { sb, AV_TENANT } from '../../lib/supabase';
import { Ic } from '../../lib/utils';
import AiSetupWizard from './AiSetupWizard';
import BidModelWizard from './BidModelWizard';

const NAV    = 'var(--navy-900)';
const GOLD   = 'var(--gold-500)';
const BORDER = 'var(--border)';
const CREAM  = 'var(--bg)';

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
  pricing:      { bg: 'var(--blue-bg)',       text: 'var(--blue-text-link-strong)' },
  scheduling:   { bg: 'var(--green-bg-soft)', text: 'var(--green-text-deep)' },
  trades:       { bg: 'var(--amber-bg-soft)', text: 'var(--amber-text-strong)' },
  materials:    { bg: 'var(--purple-bg)',      text: 'var(--purple-text)' },
  client_comms: { bg: 'var(--red-bg)',         text: 'var(--red-text-strong)' },
  process:      { bg: 'var(--blue-bg-new)',    text: 'var(--blue-text-deep)' },
  general:      { bg: 'var(--neutral-bg)',     text: 'var(--neutral-text)' },
};

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
        background: value ? NAV : 'var(--border-strong)',
        position: 'relative', flexShrink: 0, transition: 'background 0.2s',
        padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: value ? 20 : 3,
        width: 16, height: 16, borderRadius: '50%', background: 'white',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

function getSummary(content) {
  const first = (content || '').trim().split('\n')[0].trim();
  return first.length > 80 ? first.slice(0, 80) + '…' : first;
}

// Lenient "LABEL: value" parser — falls back to prose if fewer than 40% of lines match.
function parseContent(content) {
  const raw = (content || '').trim();
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const KV_RE = /^([A-Za-z][^:\n]{0,40}):\s*(.+)$/;
  const kvLines = lines.filter(l => KV_RE.test(l));
  if (kvLines.length >= 2 && kvLines.length / lines.length >= 0.4) {
    const pairs = kvLines.map(l => {
      const m = l.match(KV_RE);
      return { key: m[1].trim(), value: m[2].trim() };
    });
    return { type: 'kv', pairs };
  }
  return { type: 'prose', text: raw };
}

export default function AiKnowledgeScr({ profile }) {
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [catFilter, setCatFilter]   = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [showAdd, setShowAdd]       = useState(false);
  const [editItem, setEditItem]     = useState(null);
  const [form, setForm]             = useState({ category: 'pricing', content: '' });
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState('');
  const [deleting, setDeleting]     = useState(null);
  const [showWizard, setShowWizard]    = useState(false);
  const [showBidWizard, setShowBidWizard] = useState(false);

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
          <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 4 }}>
            Teach the AI about your company — injected into every conversation.
            <span style={{ marginLeft: 8, background: 'var(--green-bg)', color: 'var(--green-text-strong)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
              {activeCount} active {activeCount === 1 ? 'entry' : 'entries'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowBidWizard(true)}
            className="btn btn-ghost"
            style={{ whiteSpace: 'nowrap', fontSize: 13 }}
          >
            ⚙ Config Wizard
          </button>
          <button
            onClick={() => setShowWizard(true)}
            className="btn btn-ghost"
            style={{ whiteSpace: 'nowrap', fontSize: 13 }}
          >
            ✦ Retake Setup
          </button>
          <button
            onClick={openAdd}
            className="btn btn-navy"
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          >
            <span style={{ width: 14, height: 14, display: 'flex' }}>{Ic.plus}</span>
            Add Knowledge
          </button>
        </div>
      </div>

      {/* Info banner — one line */}
      <div style={{ background: 'var(--blue-bg)', border: '1px solid var(--blue-bg-new)', borderRadius: 'var(--r-xs)', padding: '8px 14px', marginBottom: 20, fontSize: 12.5, color: 'var(--blue-text-deep)' }}>
        Active entries are injected into the AI's system prompt for every job conversation.
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
                padding: '5px 12px', borderRadius: 'var(--r-full)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                border: `1px solid ${catFilter === c.id ? NAV : BORDER}`,
                background: catFilter === c.id ? NAV : 'var(--card-bg)',
                color: catFilter === c.id ? 'var(--card-bg)' : 'var(--text-muted)',
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
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-subtle)', fontSize: 14 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-subtle)', fontSize: 14 }}>
          {catFilter === 'all' ? 'No knowledge entries yet. Add your first one.' : `No entries in this category.`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(item => {
            const cat = CAT_COLORS[item.category] || CAT_COLORS.general;
            const catLabel = CATEGORIES.find(c => c.id === item.category)?.lb || item.category;
            const isExpanded = expandedId === item.id;
            const parsed = isExpanded ? parseContent(item.content) : null;
            const summary = getSummary(item.content);

            return (
              <div
                key={item.id}
                style={{
                  background: 'var(--card-bg)',
                  border: `1px solid ${item.active ? BORDER : 'var(--neutral-bg)'}`,
                  borderRadius: 'var(--r-sm)',
                  padding: '11px 14px',
                  opacity: item.active ? 1 : 0.55,
                  transition: 'opacity 0.2s',
                }}
              >
                {/* Card header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Active toggle */}
                  <div style={{ flexShrink: 0 }}>
                    <Toggle value={item.active} onChange={() => toggleActive(item)} />
                  </div>

                  {/* Clickable title + category + chevron */}
                  <div
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  >
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--r-full)',
                      background: cat.bg, color: cat.text,
                      textTransform: 'uppercase', letterSpacing: 0.6, flexShrink: 0,
                    }}>
                      {catLabel}
                    </span>
                    {!item.active && (
                      <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontStyle: 'italic', flexShrink: 0 }}>inactive</span>
                    )}
                    <span style={{
                      flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500,
                      color: 'var(--text-primary)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {summary}
                    </span>
                    <span style={{
                      width: 16, height: 16, display: 'flex', flexShrink: 0,
                      color: 'var(--text-subtle)',
                      transform: isExpanded ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s',
                    }}>
                      {Ic.chev}
                    </span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => openEdit(item)}
                      style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 'var(--r-xs)', cursor: 'pointer', color: 'var(--text-muted)', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 5 }}
                      title="Edit"
                    >
                      <span style={{ width: 13, height: 13, display: 'flex' }}>{Ic.edit}</span>
                    </button>
                    <button
                      onClick={() => del(item.id)}
                      disabled={deleting === item.id}
                      style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 'var(--r-xs)', cursor: 'pointer', color: 'var(--red-text)', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 5 }}
                      title="Delete"
                    >
                      <span style={{ width: 13, height: 13, display: 'flex' }}>{Ic.trash}</span>
                    </button>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}`, paddingLeft: 52 }}>
                    {parsed.type === 'kv' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 16, rowGap: 5 }}>
                        {parsed.pairs.map(({ key, value }, i) => (
                          <div key={i} style={{ display: 'contents' }}>
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.8, paddingTop: 2, whiteSpace: 'nowrap' }}>
                              {key}
                            </span>
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                              {value}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {parsed.text}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 10 }}>
                      Added {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showBidWizard && (
        <BidModelWizard onDone={() => setShowBidWizard(false)} />
      )}

      {/* Retake setup wizard */}
      {showWizard && (
        <AiSetupWizard profile={profile} onDone={() => { setShowWizard(false); load(); }} />
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
                Content <span style={{ color: 'var(--red-strong)' }}>*</span>
                <span style={{ fontWeight: 400, color: 'var(--text-subtle)', marginLeft: 6 }}>— write in plain English, the AI reads this directly</span>
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
              <div style={{ background: 'var(--red-bg)', color: 'var(--red-strong)', padding: '8px 12px', fontSize: 12.5, borderRadius: 'var(--r-xs)', marginBottom: 12, border: '1px solid var(--red-border)' }}>
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
