import { useState, useEffect } from 'react';
import { sbLoadChecklistForScheduleItem, sbUpdateChecklistItem } from '../../lib/supabase';
import { SITE_VISIT_TEMPLATES } from '../../lib/siteVisitTemplates';

const STATUS_COLOR = { pass: '#22c55e', fail: '#ef4444', n_a: '#9CA3AF', pending: '#E8E4DC' };
const STATUS_BG    = { pass: '#D1FAE5', fail: '#FEE2E2', n_a: '#F3F4F6' };
const STATUS_TEXT  = { pass: '#065F46', fail: '#991B1B', n_a: '#6B7280' };

export default function SiteVisitChecklist({ scheduleItemId }) {
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [pendingNotes, setPendingNotes] = useState({});
  const [pendingFail, setPendingFail]   = useState({}); // { [itemId]: true } — awaiting notes
  const [saving, setSaving]         = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await sbLoadChecklistForScheduleItem(scheduleItemId);
      setItems(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (scheduleItemId) load(); }, [scheduleItemId]);

  const handleStatus = async (item, newStatus) => {
    if (newStatus === 'fail') {
      // Stage fail — require notes before persisting
      setPendingFail(p => ({ ...p, [item.id]: true }));
      return;
    }
    setSaving(item.id);
    setError(null);
    try {
      const updated = await sbUpdateChecklistItem(item.id, { status: newStatus });
      setItems(p => p.map(i => i.id === item.id ? updated : i));
      setPendingFail(p => { const n = { ...p }; delete n[item.id]; return n; });
      setPendingNotes(p => { const n = { ...p }; delete n[item.id]; return n; });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  const saveFail = async (item) => {
    const notes = pendingNotes[item.id]?.trim();
    if (!notes) return;
    setSaving(item.id);
    setError(null);
    try {
      const updated = await sbUpdateChecklistItem(item.id, { status: 'fail', notes });
      setItems(p => p.map(i => i.id === item.id ? updated : i));
      setPendingFail(p => { const n = { ...p }; delete n[item.id]; return n; });
      setPendingNotes(p => { const n = { ...p }; delete n[item.id]; return n; });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  const cancelFail = (itemId) => {
    setPendingFail(p => { const n = { ...p }; delete n[itemId]; return n; });
    setPendingNotes(p => { const n = { ...p }; delete n[itemId]; return n; });
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 16, color: '#9CA3AF', fontSize: 13 }}>Loading checklist…</div>;

  if (!items.length) return (
    <div style={{ fontSize: 12, color: '#9CA3AF', padding: '8px 0' }}>
      No checklist for this site visit. Pick a template above to add one.
    </div>
  );

  const templateKey  = items[0]?.template_name;
  const templateName = SITE_VISIT_TEMPLATES[templateKey]?.name || templateKey;
  const done         = items.filter(i => ['pass', 'fail', 'n_a'].includes(i.status)).length;
  const passed       = items.filter(i => i.status === 'pass').length;
  const failed       = items.filter(i => i.status === 'fail').length;

  return (
    <div style={{ borderTop: '1px solid #E8E4DC', paddingTop: 14, marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Checklist — {templateName}
        </div>
        <div style={{ fontSize: 11, display: 'flex', gap: 8 }}>
          <span style={{ color: '#22c55e', fontWeight: 600 }}>{passed}✓</span>
          {failed > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}>{failed}✗</span>}
          <span style={{ color: '#9CA3AF' }}>{done}/{items.length}</span>
        </div>
      </div>

      {error && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '6px 10px', borderRadius: 4, fontSize: 12, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(item => {
          const isSaving    = saving === item.id;
          const isStagedFail = pendingFail[item.id];
          const showNotes   = isStagedFail || item.status === 'fail';
          return (
            <div key={item.id} style={{ background: '#F7F5F0', borderRadius: 6, padding: '8px 10px', borderLeft: `3px solid ${STATUS_COLOR[item.status] || '#E8E4DC'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', flex: 1 }}>{item.item_name}</div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {['pass', 'fail', 'n_a'].map(s => {
                    const isActive = item.status === s || (isStagedFail && s === 'fail');
                    return (
                      <button key={s}
                        onClick={() => handleStatus(item, s)}
                        disabled={isSaving}
                        style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                          border: `1px solid ${isActive ? STATUS_COLOR[s] : '#D1D5DB'}`,
                          background: isActive ? STATUS_BG[s] : 'transparent',
                          color: isActive ? STATUS_TEXT[s] : '#9CA3AF',
                          cursor: isSaving ? 'wait' : 'pointer',
                          textTransform: 'uppercase', letterSpacing: 0.5,
                        }}
                      >
                        {s === 'n_a' ? 'N/A' : s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {showNotes && (
                <div style={{ marginTop: 6 }}>
                  <textarea
                    placeholder="What's wrong + plan to fix (required for fail)"
                    value={pendingNotes[item.id] ?? item.notes ?? ''}
                    onChange={e => setPendingNotes(p => ({ ...p, [item.id]: e.target.value }))}
                    style={{ width: '100%', fontSize: 11, padding: '4px 8px', borderRadius: 4, border: '1px solid #FECACA', resize: 'vertical', minHeight: 44, boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                  {isStagedFail && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <button
                        onClick={() => saveFail(item)}
                        disabled={!(pendingNotes[item.id]?.trim()) || isSaving}
                        style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4, border: '1px solid #ef4444', background: '#FEE2E2', color: '#991B1B', cursor: pendingNotes[item.id]?.trim() ? 'pointer' : 'not-allowed' }}
                      >
                        {isSaving ? 'Saving…' : 'Save Fail'}
                      </button>
                      <button
                        onClick={() => cancelFail(item.id)}
                        style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: '1px solid #D1D5DB', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
