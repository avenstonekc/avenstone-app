import React, { useState, useEffect, useRef } from 'react';
import { Ic } from '../../lib/utils.jsx';
import {
  sbLoadOrCreateWalkthroughItems,
  sbUpdateWalkthroughItem,
  sbLoadWalkthroughItemPhotos,
  sbCompleteTodo,
  sbPhoto,
} from '../../lib/supabase.js';

// ── Gate constants (unchanged) ──────────────────────────────────────────────
// canComplete = mustDocPending === 0 && items.length > 0
// skip hidden when item.must_document
// fail requires notes before save
// photo count informational only — not a hard gate

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

  // Gate 1 — fail requires note entry before saving
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

  const handlePhoto = async (item, file) => {
    if (!file) return;
    setUploading(u => ({ ...u, [item.id]: true }));
    const { ok } = await sbPhoto(jobId, file, 'job_walkthrough_item', item.id);
    if (ok) setPhotoCounts(c => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }));
    setUploading(u => ({ ...u, [item.id]: false }));
  };

  const resolvedCount  = items.filter(i => i.status !== 'pending').length;
  // Gate 2 — must_document items must be resolved before completing
  const mustDocPending = items.filter(i => i.must_document && i.status === 'pending').length;
  const canComplete    = mustDocPending === 0 && items.length > 0;

  // Gate 3 — sbCompleteTodo only called if todoId is present
  const handleComplete = async () => {
    setCompleting(true);
    if (todoId) await sbCompleteTodo(todoId).catch(() => {});
    setCompleting(false);
    onClose();
  };

  // ── Status indicator ring ────────────────────────────────────────────────
  const StatusRing = ({ status }) => {
    const cfg = {
      pass:    { bg: 'var(--green-dot)',    border: 'none',                      text: '✓', color: '#fff' },
      fail:    { bg: 'var(--red-text)',     border: 'none',                      text: '✗', color: '#fff' },
      skip:    { bg: 'var(--text-subtle)',  border: 'none',                      text: '—', color: '#fff' },
      pending: { bg: 'transparent',         border: '2px solid var(--border)',   text: '',  color: 'transparent' },
    };
    const r = cfg[status] || cfg.pending;
    return (
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: r.bg, border: r.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: r.color, flexShrink: 0 }}>
        {r.text}
      </div>
    );
  };

  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--card-bg)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 28, height: 28, border: '2px solid var(--gold-500)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'aiSpin 0.7s linear infinite', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading checklist…</div>
      </div>
    </div>
  );

  const pct = items.length > 0 ? Math.round(resolvedCount / items.length * 100) : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 900, display: 'flex', flexDirection: 'column' }}>

      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, background: 'var(--navy-900)', zIndex: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--gold-500)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: '#fff', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {workType} Walkthrough
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              {resolvedCount} of {items.length} resolved
            </div>
          </div>
          {mustDocPending > 0 && (
            <span style={{ background: 'var(--amber-bg)', color: 'var(--amber-text-strong)', borderRadius: 'var(--r-full)', padding: '4px 10px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              {mustDocPending} must-doc
            </span>
          )}
        </div>
        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.12)' }}>
          <div style={{ height: '100%', background: 'var(--gold-500)', width: `${pct}%`, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: 'var(--red-bg)', color: 'var(--red-text-strong)', padding: '10px 16px', fontSize: 13, borderBottom: '1px solid var(--red-border)', flexShrink: 0 }}>
          {error}
        </div>
      )}

      {/* ── Scrollable item list ─────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 96 }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item) => {
            const inFail  = !!failMode[item.id];
            const photos  = photoCounts[item.id] || 0;
            const isUp    = !!uploading[item.id];
            const isDone  = item.status !== 'pending';

            // Card left-border treatment by status
            const statusBorder = {
              pass:    '3px solid var(--green-dot)',
              fail:    '3px solid var(--red-text)',
              skip:    '3px solid var(--text-subtle)',
              pending: '3px solid var(--border)',
            }[item.status] || '3px solid var(--border)';

            const cardBg = {
              pass:    'var(--card-bg)',
              fail:    'var(--card-bg)',
              skip:    'var(--card-bg)',
              pending: 'var(--card-bg)',
            }[item.status] || 'var(--card-bg)';

            return (
              <div
                key={item.id}
                className="av-card"
                style={{ borderLeft: statusBorder, background: cardBg, padding: '14px 16px', opacity: isDone && !inFail ? 0.85 : 1, transition: 'opacity 0.15s' }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  {/* Status ring */}
                  <StatusRing status={item.status} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Title row with inline badges */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: isDone ? 500 : 600, color: isDone ? 'var(--text-muted)' : 'var(--text-primary)', flex: 1, lineHeight: 1.45 }}>
                        {item.label}
                      </span>
                      {item.must_document && (
                        <span className="av-badge av-badge--amber" style={{ fontSize: 9, padding: '2px 7px' }}>MUST-DOC</span>
                      )}
                      {item.photo_required && (
                        <span className="av-badge av-badge--blue" style={{ fontSize: 9, padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: 3 }}><span style={{ width: 10, height: 10, display: 'flex' }}>{Ic.cam}</span>REQ</span>
                      )}
                    </div>

                    {/* Segmented Pass / Fail / Skip — hidden when in fail-note entry */}
                    {!inFail && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ display: 'inline-flex', borderRadius: 'var(--r-xs)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                          {[
                            { s: 'pass', label: '✓ Pass',  activeBg: 'var(--green-bg)',   activeColor: 'var(--green-text-strong)',  activeBorder: 'var(--border)' },
                            { s: 'fail', label: '✗ Fail',  activeBg: 'var(--red-bg)',     activeColor: 'var(--red-text-strong)',    activeBorder: 'var(--border)' },
                            ...(!item.must_document ? [{ s: 'skip', label: '— Skip', activeBg: 'var(--neutral-bg)', activeColor: 'var(--text-secondary)', activeBorder: 'var(--border)' }] : []),
                          ].map((btn, i) => (
                            <button
                              key={btn.s}
                              onClick={() => handleStatus(item, btn.s)}
                              style={{
                                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                                background: item.status === btn.s ? btn.activeBg : 'var(--card-bg)',
                                color: item.status === btn.s ? btn.activeColor : 'var(--text-muted)',
                                border: 'none',
                                borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                                cursor: 'pointer', transition: 'all 0.12s',
                              }}
                            >
                              {btn.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Fail note entry */}
                    {inFail && (
                      <div style={{ marginBottom: 10 }}>
                        <textarea
                          style={{ width: '100%', minHeight: 64, padding: '8px 10px', fontSize: 16, border: '1px solid var(--red-border)', borderRadius: 'var(--r-sm)', resize: 'vertical', background: 'var(--red-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                          placeholder="Describe what failed and what needs correcting…"
                          value={failNotes[item.id] || ''}
                          onChange={e => setFailNotes(n => ({ ...n, [item.id]: e.target.value }))}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button
                            onClick={() => saveFail(item)}
                            disabled={!(failNotes[item.id] || '').trim()}
                            style={{ padding: '6px 14px', borderRadius: 'var(--r-xs)', border: 'none', background: 'var(--red-text)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: (failNotes[item.id] || '').trim() ? 'pointer' : 'not-allowed', opacity: (failNotes[item.id] || '').trim() ? 1 : 0.45 }}
                          >
                            Save Fail
                          </button>
                          <button
                            onClick={() => setFailMode(f => { const n = { ...f }; delete n[item.id]; return n; })}
                            style={{ padding: '6px 14px', borderRadius: 'var(--r-xs)', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Saved fail notes (read-only) */}
                    {item.status === 'fail' && item.notes && !inFail && (
                      <div style={{ fontSize: 13, color: 'var(--red-text-strong)', background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 'var(--r-xs)', padding: '6px 10px', marginBottom: 10, lineHeight: 1.5 }}>
                        {item.notes}
                      </div>
                    )}

                    {/* Photo button + count */}
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
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '5px 10px', borderRadius: 'var(--r-xs)', fontSize: 12, fontWeight: 600,
                          border: `1px solid ${item.photo_required ? 'var(--purple-text)' : 'var(--border)'}`,
                          background: item.photo_required ? 'var(--purple-bg)' : 'var(--card-bg)',
                          color: item.photo_required ? 'var(--purple-text)' : 'var(--text-muted)',
                          cursor: isUp ? 'default' : 'pointer', opacity: isUp ? 0.6 : 1, transition: 'all 0.12s',
                        }}
                      >
                        <span style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{isUp ? '…' : Ic.cam}</span>
                        {photos > 0 ? `${photos} photo${photos > 1 ? 's' : ''}` : 'Add photo'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Sticky footer bar ─────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--card-bg)', borderTop: '1px solid var(--border)',
        padding: 'calc(12px + env(safe-area-inset-bottom, 0px)) 16px 12px',
        flexShrink: 0,
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {mustDocPending > 0 && (
            <div style={{ fontSize: 12, color: 'var(--amber-text-strong)', marginBottom: 8, textAlign: 'center', fontWeight: 500 }}>
              {mustDocPending} must-document item{mustDocPending > 1 ? 's' : ''} still pending — pass or fail each before completing
            </div>
          )}
          {!canComplete && mustDocPending === 0 && items.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 8, textAlign: 'center' }}>No items loaded</div>
          )}
          <button
            onClick={handleComplete}
            disabled={!canComplete || completing}
            className="av-btn-primary"
            style={{
              width: '100%', padding: '13px 16px', fontSize: 15, fontWeight: 700, justifyContent: 'center',
              background: canComplete ? 'var(--navy-900)' : 'var(--neutral-bg)',
              color: canComplete ? 'var(--gold-500)' : 'var(--text-subtle)',
              cursor: canComplete && !completing ? 'pointer' : 'not-allowed',
              opacity: completing ? 0.7 : 1,
            }}
          >
            {completing ? 'Completing…' : 'Complete Walkthrough'}
          </button>
        </div>
      </div>
    </div>
  );
}
