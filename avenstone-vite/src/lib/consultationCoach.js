// CONSULTATION_MODE Slice 2 — the anti-surprise needs-list (deterministic, pure).
//
// Given the session's assembled checklist (base fields for the scoped project types),
// the fired expansion modules, and the answers detected so far by the ambient Haiku,
// produce the money-risk-ordered list of what's still open — each tagged with how it's
// best captured (ask / measure / photo, from evidence_type). Voice reads the top of it.
// No model call — this is straight set subtraction over data the coach already has.

const EVIDENCE = {
  answer:      { verb: 'Ask',        badge: 'ASK',     color: '#1E40AF', bg: '#DBEAFE' },
  measurement: { verb: 'Measure',    badge: 'MEASURE', color: '#92400E', bg: '#FEF3C7' },
  photo:       { verb: 'Photograph', badge: 'PHOTO',   color: '#5B21B6', bg: '#EDE9FE' },
};

export function evidenceStyle(t) { return EVIDENCE[t] || EVIDENCE.answer; }

export function buildNeedsList({ fields = [], modules = [], answers = {}, firedModules = [], tradeScope = null } = {}) {
  const answered = new Set(Object.keys(answers || {}));
  const seen = new Set();
  const items = [];

  // WALKTHROUGH_TYPES — a sub walk narrows the needs-list to the walked trade(s): a field
  // is in-scope when its adds_trades intersects the session's trade_scope full-path(s), so a
  // tile-sub walk asks about waterproofing/substrate, not the whole bathroom checklist. A
  // client walk passes no tradeScope, so nothing is filtered (behavior unchanged).
  const scope = Array.isArray(tradeScope) && tradeScope.length ? tradeScope : null;
  const inTrade = (t) => !scope || (Array.isArray(t) && t.some((x) => scope.includes(x)));

  const push = (f, fallbackRank) => {
    const key = f?.field_key;
    if (!key || seen.has(key) || answered.has(key)) return;
    seen.add(key);
    items.push({
      field_key: key,
      question: f.question || key,
      evidence_type: EVIDENCE[f.evidence_type] ? f.evidence_type : 'answer',
      money_risk_rank: Number.isFinite(f.money_risk_rank) ? f.money_risk_rank : (fallbackRank ?? 99),
    });
  };

  // On a sub walk, an untagged field (no adds_trades) belongs to no specific trade → drop it.
  fields.filter((f) => inTrade(f.adds_trades)).forEach((f) => push(f, f.money_risk_rank));

  // A fired module bolts its adds_fields onto the open set (ranked just after the base).
  // Phrase-triggered fields are kept unless they carry adds_trades that fall outside the scope.
  const fired = new Set(firedModules || []);
  modules.filter((m) => fired.has(m.module_key)).forEach((m) => {
    (Array.isArray(m.adds_fields) ? m.adds_fields : []).forEach((af, i) => {
      if (scope && Array.isArray(af.adds_trades) && !inTrade(af.adds_trades)) return;
      push({ ...af, evidence_type: af.evidence_type || 'answer' }, 50 + i);
    });
  });

  items.sort((a, b) => a.money_risk_rank - b.money_risk_rank);
  return items;
}

// Spoken form for the "what am I missing?" query + the end-of-session gate.
export function needsListSpeech(items, { max = 4 } = {}) {
  if (!items || !items.length) return "You're all set — I don't see any open scope items.";
  const top = items.slice(0, max);
  const parts = top.map((it) => `${evidenceStyle(it.evidence_type).verb}: ${it.question}`);
  const more = items.length > max ? ` Plus ${items.length - max} more.` : '';
  const n = items.length;
  return `You still have ${n} open item${n === 1 ? '' : 's'}. ${parts.join('. ')}.${more}`;
}
