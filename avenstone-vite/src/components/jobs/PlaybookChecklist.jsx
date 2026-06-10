import React, { useState, useEffect, useRef } from 'react';
import {
  sbLoadOrCreateWalkthroughItems,
  sbUpdateWalkthroughItem,
  sbLoadWalkthroughItemPhotos,
  sbCompleteTodo,
  sbPhoto,
} from '../../lib/supabase.js';

const STATUS_COLOR = { pass: 'var(--green-text)', fail: 'var(--red-text)', skip: 'var(--text-subtle)', pending: '#D1D5DB' };
const STATUS_BG    = { pass: 'var(--green-bg)', fail: 'var(--red-bg)', skip: 'var(--neutral-bg)', pending: 'var(--bg)' };

export default function PlaybookChecklist({ jobId, workType, todoId, onClose }) {
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [failMode,   setFailMode]   = useState({});   // {[itemId]: true}
  const [failNotes,  setFailNotes]  = useState({});   // {[itemId]: string}
  const [uploading,  setUploading]  = useState({});   // {[itemId]: true}
  const [photoCounts,setPhotoCounts]= useState({});   // {[itemId]: number}
  const [completing, setCompleting] = useState(false);
  const fileRefs = useRef({});

  useEffect(() => { load(); }, [jobId, workType]);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { ok, data, error: err } = await sbLoadOrCreateWalkthroughItems(jobId, workType);
    if (!ok) { setError(err); setLoading(false); return; }
    setItems(data || []);
    if (data?.length) {
      const { data: photos } = await sbLoadWalkthroughItemPhotos(data.map(i => i.id));
      if (photos) {
        const counts = {};
        photos.forEach(p => { counts[p.related_entity_id] = (counts[p.related_entity_id] || 0) + 1; });
        setPhotoCounts(counts);
      }
    }
    setLoading(false);
  };

  const updateItem = (itemId, patch) =>
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...patch } : i));

  const handleStatus = async (item, newStatus) => {
    if (newStatus === 'fail') {
      setFailMode(f => ({ ...f, [item.id]: true }));
      return;
    }
    updateItem(item.id, { status: newStatus, completed_at: new Date().toISOString() });
    await sbUpdateWalkthroughItem(item.id, { status: newStatus });
  };

  const saveFail = async (item) => {
    const notes = (failNotes[item.id] || '').trim();
    if (!notes) return;
    updateItem(item.id, { status: 'fail', notes, completed_at: new Date().toISOString() });
    setFailMode(f => { const n = { ...f }; delete n[item.id]; return n; });
    await sbUpdateWalkthroughItem(item.id, { status: 'fail', notes });
  };

  const cancelFail = (itemId) => {
    setFailMode(f => { const n = { ...f }; delete n[itemId]; return n; });
  };

  const handlePhoto = async (item, file) => {
    if (!file) return;
    setUploading(u => ({ ...u, [item.id]: true }));
    const { ok } = await sbPhoto(jobId, file, 'job_walkthrough_item', item.id);
    if (ok) setPhotoCounts(c => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }));
    setUploading(u => ({ ...u, [item.id]: false }));
  };

  const resolvedCount = items.filter(i => i.status !== 'pending').length;
  const mustDocPending = items.filter(i => i.must_document && i.status === 'pending').length;
  const canComplete = mustDocPending === 0 && items.length > 0;

  const handleComplete = async () => {
    setCompleting(true);
    if (todoId) await sbCompleteTodo(todoId).catch(() => {});
    setCompleting(false);
    onClose();
  };

  const btnSm = (color, bg, border) => ({
    padding: '5px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', border: `1px solid ${border || color}`,
    background: bg || '#fff', color, transition: 'all 0.12s',
  });

  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 14, color: '#6B7280' }}>Loading checklist…</div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 900, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, background: 'var(--navy-900)', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, zIndex: 10 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--gold-500)', fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1 }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{workType} Walkthrough</div>
          <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 1 }}>
            {resolvedCount}/{items.length} resolved
            {mustDocPending > 0 && <span style={{ color: '#FCD34D', marginLeft: 8 }}>· {mustDocPending} must-doc pending</span>}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', color: '#991b1b', padding: '10px 16px', fontSize: 13 }}>{error}</div>
      )}

      {/* Item list */}
      <div style={{ flex: 1, padding: '8px 0 80px' }}>
        {items.map((item, idx) => {
          const inFail  = !!failMode[item.id];
          const photos  = photoCounts[item.id] || 0;
          const isUp    = !!uploading[item.id];
          const isDone  = item.status !== 'pending';
          const statusC = STATUS_COLOR[item.status] || STATUS_COLOR.pending;
          const statusBg= STATUS_BG[item.status]    || STATUS_BG.pending;

          return (
            <div key={item.id} style={{ borderBottom: '1px solid #F3F4F6', padding: '14px 16px', background: statusBg }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {/* Status dot */}
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusC, marginTop: 4, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: isDone ? 500 : 600, color: isDone ? '#6B7280' : 'var(--navy-900)', flex: 1, lineHeight: 1.4 }}>{item.label}</span>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {item.must_document && <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 3, padding: '1px 5px' }}>MUST-DOC</span>}
                      {item.photo_required && <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#EDE9FE', border: '1px solid #DDD6FE', borderRadius: 3, padding: '1px 5px' }}>📷 REQ</span>}
                    </div>
                  </div>

                  {/* Status buttons (only when not in fail-note mode) */}
                  {!inFail && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                      <button onClick={() => handleStatus(item, 'pass')} style={{ ...btnSm('#16a34a', item.status === 'pass' ? '#D1FAE5' : '#fff', '#BBF7D0') }}>✓ Pass</button>
                      <button onClick={() => handleStatus(item, 'fail')} style={{ ...btnSm('#dc2626', item.status === 'fail' ? '#FEE2E2' : '#fff', '#FECACA') }}>✗ Fail</button>
                      {!item.must_document && (
                        <button onClick={() => handleStatus(item, 'skip')} style={{ ...btnSm('#6B7280', item.status === 'skip' ? '#F3F4F6' : '#fff', '#E5E7EB') }}>— Skip</button>
                      )}
                    </div>
                  )}

                  {/* Fail note mode */}
                  {inFail && (
                    <div style={{ marginBottom: 6 }}>
                      <textarea
                        style={{ width: '100%', minHeight: 64, padding: '8px 10px', fontSize: 16, border: '1px solid #FECACA', borderRadius: 6, resize: 'vertical', background: '#FEF2F2', color: 'var(--navy-900)', boxSizing: 'border-box' }}
                        placeholder="Describe what failed and what needs correcting…"
                        value={failNotes[item.id] || ''}
                        onChange={e => setFailNotes(n => ({ ...n, [item.id]: e.target.value }))}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <button onClick={() => saveFail(item)} disabled={!(failNotes[item.id] || '').trim()} style={{ ...btnSm('#fff', '#dc2626', '#dc2626'), opacity: (failNotes[item.id] || '').trim() ? 1 : 0.45 }}>Save Fail</button>
                        <button onClick={() => setFailMode(f => { const n={...f}; delete n[item.id]; return n; })} style={btnSm('#6B7280', '#fff', '#E5E7EB')}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Existing fail notes */}
                  {item.status === 'fail' && item.notes && !inFail && (
                    <div style={{ fontSize: 13, color: '#dc2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 5, padding: '5px 8px', marginBottom: 6 }}>{item.notes}</div>
                  )}

                  {/* Photo row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      ref={el => fileRefs.current[item.id] = el}
                      type="file" accept="image/*" capture="environment"
                      style={{ display: 'none' }}
                      onChange={e => handlePhoto(item, e.target.files?.[0])}
                    />
                    <button
                      onClick={() => fileRefs.current[item.id]?.click()}
                      disabled={isUp}
                      style={{ ...btnSm(item.photo_required ? '#7c3aed' : '#6B7280', item.photo_required ? '#EDE9FE' : '#fff', item.photo_required ? '#DDD6FE' : '#E5E7EB'), display: 'flex', alignItems: 'center', gap: 4, opacity: isUp ? 0.6 : 1 }}
                    >
                      {isUp ? '…' : '📷'} {photos > 0 ? `${photos} photo${photos > 1 ? 's' : ''}` : 'Add photo'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #E8E4DC', padding: 'calc(12px + env(safe-area-inset-bottom, 0px)) 16px 12px' }}>
        {mustDocPending > 0 && (
          <div style={{ fontSize: 12, color: '#d97706', marginBottom: 8, textAlign: 'center' }}>
            {mustDocPending} must-document item{mustDocPending > 1 ? 's' : ''} still pending — pass or fail each before completing
          </div>
        )}
        <button
          onClick={handleComplete}
          disabled={!canComplete || completing}
          style={{ width: '100%', padding: '12px 16px', borderRadius: 8, border: 'none', fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 700, cursor: canComplete && !completing ? 'pointer' : 'not-allowed', background: canComplete ? 'var(--navy-900)' : '#E5E7EB', color: canComplete ? 'var(--gold-500)' : 'var(--text-subtle)', transition: 'all 0.15s' }}
        >
          {completing ? 'Completing…' : 'Complete Walkthrough'}
        </button>
      </div>

    </div>
  );
}
