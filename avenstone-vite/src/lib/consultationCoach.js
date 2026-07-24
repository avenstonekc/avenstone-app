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

// CONSULTATION_POCKET_FALLBACK FIX 2 — the needs-list carries ROOM CONTEXT. The coach keeps
// whole-job coverage (all in-scope rooms), but every item is tagged with its room so "flooring"
// during a bathroom talk reads "Bedroom 1 — flooring material?" instead of a context-free prompt.
// Each in-scope room instance contributes its project_type's walk fields; items from the room(s)
// detected in the current conversation float to the top. Answer tracking stays global by
// field_key (a field answered once clears from every room — accepted approximation, no per-room
// answer store exists). Deterministic, no model call.
export function buildNeedsList({ rooms = [], fieldsByType = {}, modules = [], answers = {}, firedModules = [], tradeScope = null, detectedRoomKeys = null } = {}) {
  const answered = new Set(Object.keys(answers || {}));
  const items = [];

  // WALKTHROUGH_TYPES — a sub walk narrows to the walked trade(s): a field is in-scope when its
  // adds_trades intersects the session's trade_scope full-path(s). A client walk passes none.
  const scope = Array.isArray(tradeScope) && tradeScope.length ? tradeScope : null;
  const inTrade = (t) => !scope || (Array.isArray(t) && t.some((x) => scope.includes(x)));
  const detected = detectedRoomKeys instanceof Set
    ? detectedRoomKeys
    : new Set(Array.isArray(detectedRoomKeys) ? detectedRoomKeys : []);

  // Per-room expansion: each in-scope room contributes its project_type's walk fields.
  for (const room of rooms) {
    const fields = fieldsByType[room.project_type] || [];
    const seen = new Set();
    for (const f of fields) {
      const key = f?.field_key;
      if (!key || seen.has(key) || answered.has(key)) continue;
      if (!inTrade(f.adds_trades)) continue; // sub walk drops untagged/other-trade fields
      seen.add(key);
      items.push({
        room_key: room.room_key,
        room_label: room.room_label,
        field_key: key,
        question: f.question || key,
        evidence_type: EVIDENCE[f.evidence_type] ? f.evidence_type : 'answer',
        money_risk_rank: Number.isFinite(f.money_risk_rank) ? f.money_risk_rank : 99,
        detected: detected.has(room.room_key),
      });
    }
  }

  // Fired modules → a job-wide "General" group (phrase-triggered, not tied to one room).
  const fired = new Set(firedModules || []);
  const genSeen = new Set();
  modules.filter((m) => fired.has(m.module_key)).forEach((m) => {
    (Array.isArray(m.adds_fields) ? m.adds_fields : []).forEach((af, i) => {
      const key = af?.field_key;
      if (!key || genSeen.has(key) || answered.has(key)) return;
      if (scope && Array.isArray(af.adds_trades) && !inTrade(af.adds_trades)) return;
      genSeen.add(key);
      items.push({
        room_key: '__general__',
        room_label: 'General',
        field_key: key,
        question: af.question || key,
        evidence_type: EVIDENCE[af.evidence_type] ? af.evidence_type : 'answer',
        money_risk_rank: Number.isFinite(af.money_risk_rank) ? af.money_risk_rank : (50 + i),
        detected: false,
      });
    });
  });

  // Detected room(s) float to the top; then money-risk order. Render groups by room, so grouping
  // by first-appearance keeps detected rooms first.
  items.sort((a, b) => (Number(b.detected) - Number(a.detected)) || (a.money_risk_rank - b.money_risk_rank));
  return items;
}

// Group a needs-list into room sections, preserving the float order (detected rooms first).
export function groupNeedsByRoom(items) {
  const out = [];
  const idx = {};
  (items || []).forEach((it) => {
    let g = idx[it.room_key];
    if (!g) { g = { room_key: it.room_key, room_label: it.room_label, detected: !!it.detected, items: [] }; idx[it.room_key] = g; out.push(g); }
    g.items.push(it);
  });
  return out;
}

// Spoken form for the "what am I missing?" query + the end-of-session gate. Reads the room name
// with each item so a spoken prompt is never context-free.
//
// CONSULTATION_COACH_FIXES FIX 1 — an empty list is NOT automatically "you're all set". `loaded`
// says whether a checklist was actually assembled (rooms/modules with coverable fields). Empty +
// loaded = genuinely all covered; empty + NOT loaded = nothing to track yet, so tell the rep to
// talk — never falsely congratulate a session that just started.
export function needsListSpeech(items, { max = 4, loaded = true } = {}) {
  if (!items || !items.length) {
    return loaded
      ? "You're all set — that's every open item covered."
      : "Nothing's loaded yet — tell me about the project and I'll track what still needs covering.";
  }
  const top = items.slice(0, max);
  const parts = top.map((it) => {
    const room = it.room_label && it.room_label !== 'General' ? `For ${it.room_label}, ` : '';
    return `${room}${evidenceStyle(it.evidence_type).verb.toLowerCase()} ${it.question}`;
  });
  const more = items.length > max ? ` Plus ${items.length - max} more.` : '';
  const n = items.length;
  return `You still have ${n} open item${n === 1 ? '' : 's'}. ${parts.join('. ')}.${more}`;
}
