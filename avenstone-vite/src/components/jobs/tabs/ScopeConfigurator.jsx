import { useState, useEffect, useCallback } from 'react';
import { sbScopePlan, sbLoadScopeOptionData } from '../../../lib/supabase';

// ESTIMATE_CONFIGURATOR S2 — tap-through scope configurator. One question per screen; cards where
// option images exist, big controls where they don't; a chip strip to jump back; re-fetches the
// deterministic plan (sbScopePlan, no LLM) after each answer so trigger-fired follow-ups unlock
// instantly. Each answer persists through the caller's persistAnswers (EstimateTab.persist-
// ScopeAnswers → the single job_scope_answers writer; trade is derived server-side as rep_card,
// never stamped here). Fires onComplete when the plan reports scope_complete; onSkip lets the rep
// force a draft past open questions (pricing handoff unchanged, owned by the caller).

const humanize = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();

export default function ScopeConfigurator({ projectType, persistAnswers, onComplete, onSkip }) {
  const [plan, setPlan]         = useState(null);   // { fields, open_field_keys, scope_complete, answers }
  const [answers, setAnswers]   = useState({});     // { field_key: value }
  const [images, setImages]     = useState({});     // { field_key: { option_key: url } }
  const [activeKey, setActive]  = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [draft, setDraft]       = useState('');     // in-progress number/text input

  useEffect(() => {
    if (!projectType) return;
    sbLoadScopeOptionData(projectType).then(d => setImages(d.images || {})).catch(() => {});
  }, [projectType]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const res = await sbScopePlan(projectType, []);
      if (!alive) return;
      setLoading(false);
      if (!res.ok) { setError(res.error || 'Could not load scope plan'); return; }
      setPlan(res.data);
      setActive(res.data.open_field_keys?.[0] || res.data.fields?.[0]?.field_key || null);
      if (res.data.scope_complete) onComplete?.({});
    })();
    return () => { alive = false; };
  }, [projectType]); // eslint-disable-line react-hooks/exhaustive-deps

  const fieldByKey = {};
  (plan?.fields || []).forEach(f => { fieldByKey[f.field_key] = f; });
  const activeField = activeKey ? fieldByKey[activeKey] : null;

  const answerField = useCallback(async (fieldKey, value) => {
    if (value == null || String(value).trim() === '') return;
    const next = { ...answers, [fieldKey]: value };
    setAnswers(next);
    setDraft('');
    setLoading(true);
    const arr = Object.entries(next).map(([field_key, v]) => ({ field_key, value: v }));
    const res = await sbScopePlan(projectType, arr);
    setLoading(false);
    if (!res.ok) { setError(res.error || 'Could not update scope'); return; }
    setError(null);
    setPlan(res.data);
    // Persist just the field we answered — server-derived answer (option_key + trade, rep_card).
    const persisted = (res.data.answers || []).find(a => a.field_key === fieldKey);
    if (persisted && persistAnswers) persistAnswers([persisted]);
    if (res.data.scope_complete) { onComplete?.(next); setActive(null); return; }
    const open = res.data.open_field_keys || [];
    // Advance to the next still-open field (prefer one after the one just answered).
    setActive(open.find(k => k !== fieldKey) || open[0] || null);
  }, [answers, projectType, persistAnswers, onComplete]);

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
          return (
            <button key={f.field_key} style={{ ...chipStyle(state), flex: 'none' }} onClick={() => setActive(f.field_key)} title={f.question}>
              {humanize(f.field_key)}{done ? `: ${humanize(String(answers[f.field_key]))}` : ''}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 10 }}>
        {answeredN} of {fields.length} answered{loading ? ' · updating…' : ''}
      </div>

      {activeField ? (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 20, boxShadow: 'var(--shadow-xs)' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
            {activeField.question}
            {activeField.origin && activeField.origin !== 'base' && (
              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--gold, #C9A84C)', textTransform: 'uppercase' }}>added</span>
            )}
          </div>

          {/* Choice + images → cards */}
          {hasCards && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {opts.map(o => {
                const selected = answers[activeField.field_key] === o;
                return (
                  <button key={o} onClick={() => answerField(activeField.field_key, o)} disabled={loading}
                    style={{ border: `2px solid ${selected ? 'var(--navy-900)' : 'var(--border)'}`, borderRadius: 'var(--r-md)', padding: 0, overflow: 'hidden', cursor: 'pointer', background: 'var(--card-bg)', textAlign: 'left' }}>
                    {fieldImgs[o]
                      ? <img src={fieldImgs[o]} alt={humanize(o)} style={{ width: '100%', height: 96, objectFit: 'cover', display: 'block' }} />
                      : <div style={{ width: '100%', height: 96, background: 'var(--neutral-bg, #F1EFEA)' }} />}
                    <div style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600, color: selected ? 'var(--navy-900)' : 'var(--text-primary)' }}>{humanize(o)}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Choice without images → big buttons */}
          {activeField.field_type === 'choice' && !hasCards && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {opts.map(o => (
                <button key={o} onClick={() => answerField(activeField.field_key, o)} disabled={loading} style={bigBtn(answers[activeField.field_key] === o)}>
                  {humanize(o)}
                </button>
              ))}
            </div>
          )}

          {/* Bool → Yes / No */}
          {activeField.field_type === 'bool' && (
            <div style={{ display: 'flex', gap: 10 }}>
              {['yes', 'no'].map(o => (
                <button key={o} onClick={() => answerField(activeField.field_key, o)} disabled={loading} style={{ ...bigBtn(answers[activeField.field_key] === o), textAlign: 'center' }}>
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
