import { useState, useEffect, useCallback } from 'react';
import { sbScopePlan, sbLoadScopeOptionData, sbLoadScopeAnswers, sbDeleteScopeAnswers, AV_USER_ID } from '../../../lib/supabase';

// ESTIMATE_CONFIGURATOR S2 — tap-through scope configurator. One question per screen; cards where
// option images exist, big controls where they don't; a chip strip to jump back; re-fetches the
// deterministic plan (sbScopePlan, no LLM) after each answer so trigger-fired follow-ups unlock
// instantly. Each answer persists through the caller's persistAnswers (EstimateTab.persist-
// ScopeAnswers → the single job_scope_answers writer; trade is derived server-side as rep_card,
// never stamped here). Fires onComplete when the plan reports scope_complete; onSkip lets the rep
// force a draft past open questions (pricing handoff unchanged, owned by the caller).

const humanize = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();

export default function ScopeConfigurator({ jobId, projectType, persistAnswers, onComplete, onSkip }) {
  const [plan, setPlan]         = useState(null);   // { fields, open_field_keys, scope_complete, answers }
  const [answers, setAnswers]   = useState({});     // { field_key: value }
  const [images, setImages]     = useState({});     // { field_key: { option_key: url } }
  const [activeKey, setActive]  = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [draft, setDraft]       = useState('');     // in-progress number/text input
  // SCOPE_PREFILL P3 — MED prefills held as pending (shown pre-selected for one-tap confirm, NOT
  // seeded so the field stays open); prefillMeta carries provenance for the "from your scope" glyph.
  const [pending, setPending]         = useState({}); // field_key -> { option_key, evidence_phrase }
  const [prefillMeta, setPrefillMeta] = useState({}); // field_key -> { status, evidence_phrase }

  useEffect(() => {
    if (!projectType) return;
    sbLoadScopeOptionData(projectType).then(d => setImages(d.images || {})).catch(() => {});
  }, [projectType]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      // Hydrate from persisted answers (resume) so we don't re-ask what's already captured.
      const seed = {}, pend = {}, meta = {};
      if (jobId) {
        try {
          const stored = await sbLoadScopeAnswers(jobId);
          if (stored.ok) for (const a of (stored.data || [])) {
            const v = a.option_key ?? a.value;
            if (v == null || String(v).trim() === '') continue;
            // AI-sourced prefills: 'scope_prefill' (from the text scope) or 'photo' (from vision).
            // 'measured' (from the LiDAR scan) is authoritative + confirmed — it seeds like a rep
            // answer but carries provenance so the chip reads "from your scan".
            const aiPrefill = a.source === 'scope_prefill' || a.source === 'photo';
            if (aiPrefill || a.source === 'measured') meta[a.field_key] = { status: a.status, evidence_phrase: a.evidence_phrase, source: a.source };
            // A proposed AI prefill: keep OUT of the plan's answered set so it stays an open question,
            // and hold it pending for a pre-selected one-tap confirm. Confirmed prefills and rep
            // answers seed normally (engine skips + fires unlocks).
            if (aiPrefill && a.status === 'proposed') pend[a.field_key] = { option_key: v, evidence_phrase: a.evidence_phrase, source: a.source };
            else seed[a.field_key] = v;
          }
        } catch { /* start fresh on failure */ }
      }
      const arr = Object.entries(seed).map(([field_key, value]) => ({ field_key, value }));
      const res = await sbScopePlan(projectType, arr);
      if (!alive) return;
      setLoading(false);
      if (!res.ok) { setError(res.error || 'Could not load scope plan'); return; }
      setAnswers(seed);
      setPending(pend);
      setPrefillMeta(meta);
      setPlan(res.data);
      setActive(res.data.open_field_keys?.[0] || res.data.fields?.[0]?.field_key || null);
      if (res.data.scope_complete) onComplete?.(seed);
    })();
    return () => { alive = false; };
  }, [projectType, jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fieldByKey = {};
  (plan?.fields || []).forEach(f => { fieldByKey[f.field_key] = f; });
  const activeField = activeKey ? fieldByKey[activeKey] : null;
  // Provenance label for the ✦ glyph: where a pre-filled answer came from.
  const srcLabel = (s) => s === 'photo' ? 'photos' : s === 'measured' ? 'scan' : 'scope';

  const answerField = useCallback(async (fieldKey, value) => {
    if (value == null || String(value).trim() === '') return;
    const wasPending = pending[fieldKey]; // a MED prefill being confirmed/overridden
    const next = { ...answers, [fieldKey]: value };
    setAnswers(next);
    if (wasPending) setPending(p => { const n = { ...p }; delete n[fieldKey]; return n; });
    setDraft('');
    setLoading(true);
    const arr = Object.entries(next).map(([field_key, v]) => ({ field_key, value: v }));
    const res = await sbScopePlan(projectType, arr);
    setLoading(false);
    if (!res.ok) { setError(res.error || 'Could not update scope'); return; }
    setError(null);
    setPlan(res.data);
    // Phase 3 — orphan cleanup: any answered field this change now suppresses is removed locally
    // AND deleted from the store (e.g. answer shower_entry, then flip tub_shower_config to combo).
    const supp = new Set((res.data.suppressed || []).map(k => String(k).toLowerCase()));
    const orphans = Object.keys(next).filter(k => supp.has(k.toLowerCase()));
    let effective = next;
    if (orphans.length) {
      effective = { ...next };
      orphans.forEach(k => delete effective[k]);
      setAnswers(effective);
      if (jobId) sbDeleteScopeAnswers(jobId, orphans);
    }
    // Persist just the field we answered — server-derived answer (option_key + trade, rep_card).
    // Confirming a MED prefill flips it to confirmed and keeps the scope-prefill provenance +
    // evidence; a normal rep answer persists as-is (DB default status 'proposed').
    const persisted = (res.data.answers || []).find(a => a.field_key === fieldKey);
    if (persisted && persistAnswers) {
      persistAnswers([wasPending
        ? { ...persisted, source: wasPending.source || 'scope_prefill', status: 'confirmed', evidence_phrase: wasPending.evidence_phrase, confirmed_by: AV_USER_ID } // human confirm — keeps provenance, protects from re-parse
        : persisted]);
    }
    if (res.data.scope_complete) { onComplete?.(effective); setActive(null); return; }
    const open = res.data.open_field_keys || [];
    // Advance to the next still-open field (prefer one after the one just answered).
    setActive(open.find(k => k !== fieldKey) || open[0] || null);
  }, [answers, pending, projectType, persistAnswers, onComplete]);

  if (error) return (
    <div style={{ padding: 16, background: 'var(--error-bg, #FEE2E2)', borderRadius: 'var(--r-md)', color: 'var(--error, #B91C1C)', fontSize: 13 }}>
      {error} <button onClick={() => { setError(null); setActive(a => a); }} style={{ marginLeft: 8, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>dismiss</button>
    </div>
  );
  if (!plan) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading scope…</div>;

  const fields = plan.fields || [];
  const answeredN = fields.filter(f => answers[f.field_key] != null && String(answers[f.field_key]).trim() !== '').length;
  const opts = Array.isArray(activeField?.options) ? activeField.options : [];
  const fieldImgs = activeField ? (images[activeField.field_key] || {}) : {};
  const hasCards = activeField?.field_type === 'choice' && opts.some(o => fieldImgs[o]);
  // Phase 4a — display label from data (option_labels), falling back to humanize(key).
  const labelOf = (o) => activeField?.option_labels?.[o] || humanize(o);
  // SCOPE_PREFILL P3 — the active field may be a MED prefill awaiting confirm: pre-select its
  // parsed option (highlighted) so a single tap on it confirms and advances.
  const activePending = activeField ? pending[activeField.field_key] : null;
  const selOf = (o) => (answers[activeField?.field_key] ?? activePending?.option_key) === o;

  const chipStyle = (state) => ({
    padding: '5px 10px', borderRadius: 'var(--r-full)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap', border: '1px solid var(--border)',
    background: state === 'active' ? 'var(--navy-900)' : state === 'done' ? 'var(--navy-100)' : 'var(--card-bg)',
    color: state === 'active' ? '#fff' : state === 'done' ? 'var(--navy-900)' : 'var(--text-subtle)',
  });
  const bigBtn = (selected) => ({
    padding: '14px 16px', borderRadius: 'var(--r-md)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
    minHeight: 48, textAlign: 'left', width: '100%',
    border: `2px solid ${selected ? 'var(--navy-900)' : 'var(--border)'}`,
    background: selected ? 'var(--navy-100)' : 'var(--card-bg)', color: 'var(--text-primary)',
  });

  return (
    <div>
      {/* Chip strip — jump back to any field */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 12, flexWrap: 'nowrap' }}>
        {fields.map(f => {
          const done = answers[f.field_key] != null && String(answers[f.field_key]).trim() !== '';
          const state = f.field_key === activeKey ? 'active' : done ? 'done' : 'todo';
          // A done field that originated from the scope parser gets a subtle glyph — reads as
          // "already known", not machinery. Tapping still reopens it like any answered pill.
          const fromScope = done && prefillMeta[f.field_key];
          return (
            <button key={f.field_key} style={{ ...chipStyle(state), flex: 'none' }} onClick={() => setActive(f.field_key)} title={fromScope ? `Pre-filled from your ${srcLabel(prefillMeta[f.field_key]?.source)} — tap to change` : f.question}>
              {fromScope && <span style={{ color: 'var(--gold-500)', marginRight: 4 }}>✦</span>}
              {humanize(f.field_key)}{done ? `: ${f.option_labels?.[answers[f.field_key]] || humanize(String(answers[f.field_key]))}` : ''}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 10 }}>
        {answeredN} of {fields.length} answered{loading ? ' · updating…' : ''}
      </div>

      {activeField ? (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 20, boxShadow: 'var(--shadow-xs)' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: activeField.helper ? 6 : 16 }}>
            {activeField.question}
            {activeField.origin && activeField.origin !== 'base' && (
              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--gold, #C9A84C)', textTransform: 'uppercase' }}>added</span>
            )}
          </div>
          {/* Phase 4c — unobtrusive "what's this?" helper, expertise inline. */}
          {activeField.helper && (
            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 16, lineHeight: 1.4, display: 'flex', gap: 6 }}>
              <span style={{ flexShrink: 0, fontWeight: 700 }}>ⓘ</span><span>{activeField.helper}</span>
            </div>
          )}

          {/* SCOPE_PREFILL P3 — MED prefill: the parsed option is pre-selected below; this line shows
              the scope wording that justified it. One tap on the highlighted option confirms. */}
          {activePending && (
            <div style={{ fontSize: 12, marginBottom: 16, lineHeight: 1.4, display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{ color: 'var(--gold-500)', fontWeight: 700, flexShrink: 0 }}>✦ from your {srcLabel(activePending.source)}:</span>
              <em style={{ color: 'var(--text-secondary)' }}>&ldquo;{activePending.evidence_phrase}&rdquo;</em>
            </div>
          )}

          {/* Choice + images → cards */}
          {hasCards && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {opts.map(o => {
                const selected = selOf(o);
                return (
                  <button key={o} onClick={() => answerField(activeField.field_key, o)} disabled={loading}
                    style={{ border: `2px solid ${selected ? 'var(--navy-900)' : 'var(--border)'}`, borderRadius: 'var(--r-md)', padding: 0, overflow: 'hidden', cursor: 'pointer', background: 'var(--card-bg)', textAlign: 'left' }}>
                    {fieldImgs[o]
                      ? <img src={fieldImgs[o]} alt={labelOf(o)} style={{ width: '100%', height: 96, objectFit: 'cover', display: 'block' }} />
                      : <div style={{ width: '100%', height: 96, background: 'var(--neutral-bg, #F1EFEA)' }} />}
                    <div style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600, color: selected ? 'var(--navy-900)' : 'var(--text-primary)' }}>{labelOf(o)}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Choice without images → big buttons */}
          {activeField.field_type === 'choice' && !hasCards && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {opts.map(o => (
                <button key={o} onClick={() => answerField(activeField.field_key, o)} disabled={loading} style={bigBtn(selOf(o))}>
                  {labelOf(o)}
                </button>
              ))}
            </div>
          )}

          {/* Bool → Yes / No */}
          {activeField.field_type === 'bool' && (
            <div style={{ display: 'flex', gap: 10 }}>
              {['yes', 'no'].map(o => (
                <button key={o} onClick={() => answerField(activeField.field_key, o)} disabled={loading} style={{ ...bigBtn(selOf(o)), textAlign: 'center' }}>
                  {humanize(o)}
                </button>
              ))}
            </div>
          )}

          {/* Number / text → input + Next */}
          {(activeField.field_type === 'number' || activeField.field_type === 'text') && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="finp" type={activeField.field_type === 'number' ? 'number' : 'text'}
                value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') answerField(activeField.field_key, draft); }}
                placeholder={activeField.field_type === 'number' ? 'Enter a number' : 'Type your answer'}
                style={{ flex: 1, fontSize: 16, minHeight: 48 }} autoFocus
              />
              <button onClick={() => answerField(activeField.field_key, draft)} disabled={loading || !draft.trim()}
                style={{ padding: '0 20px', borderRadius: 'var(--r-md)', background: 'var(--navy-900)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', minHeight: 48 }}>
                Next
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          {plan.scope_complete ? 'Scope complete — pricing your estimate…' : 'Pick a question above to continue.'}
        </div>
      )}

      {onSkip && !plan.scope_complete && (
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button onClick={onSkip} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
            Skip remaining & draft anyway
          </button>
        </div>
      )}
    </div>
  );
}
