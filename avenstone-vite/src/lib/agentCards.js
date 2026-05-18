// Agent Card payload contract — pending_card / card_response.
//
// pending_card: emitted by ai-master-agent when a tool needs structured input
// from the user before it can act. The client renders the card; the user fills
// it out; the client sends card_response back as the next turn. The edge fn
// injects answers into conversation history and re-runs the agent loop so
// Claude can proceed with the answered input.
//
// ──────────────────────────────────────────────────────────────────────────────
// pending_card shape:
// {
//   id: string,              // UUID — ties this card to its card_response
//   prompt: string,          // card header / question displayed to the user
//   questions: Array<{
//     id: string,            // unique within this card
//     type: 'select'         // single choice from a flat option list
//          | 'radio_per_item', // list of items, each gets one choice from the same options
//     label: string,         // displayed above the input
//     options: Array<{       // choices for select; column headers for radio_per_item
//       value: string,
//       label: string,
//     }>,
//     items?: Array<{        // radio_per_item only — one row per item
//       id: string,
//       label: string,
//     }>,
//   }>,
// }
//
// card_response shape:
// {
//   card_id: string,         // must match pending_card.id
//   answers: {
//     [questionId]: string                    // select: the chosen option.value
//              | { [itemId]: string }         // radio_per_item: option.value per item
//   }
// }
// ──────────────────────────────────────────────────────────────────────────────
// Control flow (mirrors pending_action / confirmed, but branches on purpose):
//   confirmed: true  → skips Claude, runs executor deterministically.
//   card_response    → MUST go through runAgentLoop — the model receives the
//                      structured answers and decides the tool call.
//
//   Round-trip wiring:
//   1. Edge fn returns { pending_card } + the assistant text that prompted it.
//   2. callMaster appends { role:'assistant', content: aiText } to
//      conversationHistory (same as any normal turn).
//   3. Client renders the card; user fills it out.
//   4. submitCard calls formatCardAnswers(card, answers) → answersText, appends
//      { role:'user', content: answersText } to conversationHistory, then POSTs
//      { card_response, conversation_history: updatedHistory }.
//   5. Edge fn detects card_response, skips message-validation, runs
//      runAgentLoop with the full history which ends with
//      [assistant: card question] → [user: formatted answers].
//      No extra user message is appended — the answers are already in history.
//   6. Claude sees the complete context and calls the intended tool.
//
// Guard rail: cards are always dismissable. Cancel reverts to plain text turns.
// ──────────────────────────────────────────────────────────────────────────────

/** @type {ReadonlyArray<string>} */
export const CARD_QUESTION_TYPES = ['select', 'radio_per_item'];

/**
 * Format card answers into a plain-text user message for conversation history.
 * Called by MasterAgent.submitCard before appending to conversationHistory so
 * the edge fn receives history ending with the answers as a user turn.
 *
 * @param {{ id: string, prompt: string, questions: Array<any> }} card
 * @param {Record<string, string | Record<string, string>>} answers
 * @returns {string}
 */
export function formatCardAnswers(card, answers) {
  const lines = [
    `Card answered (id: ${card.id}):`,
    `Prompt: ${card.prompt}`,
  ];
  for (const q of (card.questions || [])) {
    const ans = answers[q.id];
    if (q.type === 'select') {
      const opt = (q.options || []).find(o => o.value === ans);
      lines.push(`${q.label}: ${opt ? opt.label : String(ans ?? '')}`);
    } else if (q.type === 'radio_per_item' && ans && typeof ans === 'object') {
      lines.push(`${q.label}:`);
      for (const item of (q.items || [])) {
        const chosen = /** @type {Record<string,string>} */ (ans)[item.id];
        const opt = (q.options || []).find(o => o.value === chosen);
        lines.push(`  ${item.label}: ${opt ? opt.label : String(chosen ?? '')}`);
      }
    }
  }
  return lines.join('\n');
}

/**
 * Validate a pending_card object arriving in the edge fn response.
 * @param {unknown} card
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validatePendingCard(card) {
  if (!card || typeof card !== 'object') {
    return { ok: false, error: 'pending_card must be an object' };
  }
  const c = /** @type {any} */ (card);
  if (typeof c.id !== 'string' || !c.id) {
    return { ok: false, error: 'pending_card.id must be a non-empty string' };
  }
  if (typeof c.prompt !== 'string' || !c.prompt) {
    return { ok: false, error: 'pending_card.prompt must be a non-empty string' };
  }
  if (!Array.isArray(c.questions) || c.questions.length === 0) {
    return { ok: false, error: 'pending_card.questions must be a non-empty array' };
  }
  for (const q of c.questions) {
    if (typeof q.id !== 'string' || !q.id) {
      return { ok: false, error: 'question missing id' };
    }
    if (!CARD_QUESTION_TYPES.includes(q.type)) {
      return { ok: false, error: `question "${q.id}": unsupported type "${q.type}"` };
    }
    if (typeof q.label !== 'string') {
      return { ok: false, error: `question "${q.id}": label must be a string` };
    }
    if (!Array.isArray(q.options) || q.options.length === 0) {
      return { ok: false, error: `question "${q.id}": options must be a non-empty array` };
    }
    for (const opt of q.options) {
      if (typeof opt.value !== 'string' || typeof opt.label !== 'string') {
        return { ok: false, error: `question "${q.id}": each option needs value and label strings` };
      }
    }
    if (q.type === 'radio_per_item') {
      if (!Array.isArray(q.items) || q.items.length === 0) {
        return { ok: false, error: `question "${q.id}": radio_per_item requires a non-empty items array` };
      }
      for (const item of q.items) {
        if (typeof item.id !== 'string' || typeof item.label !== 'string') {
          return { ok: false, error: `question "${q.id}": each item needs id and label strings` };
        }
      }
    }
  }
  return { ok: true };
}

/**
 * Validate a card_response object before sending to the edge fn.
 * @param {unknown} resp
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateCardResponse(resp) {
  if (!resp || typeof resp !== 'object') {
    return { ok: false, error: 'card_response must be an object' };
  }
  const r = /** @type {any} */ (resp);
  if (typeof r.card_id !== 'string' || !r.card_id) {
    return { ok: false, error: 'card_response.card_id must be a non-empty string' };
  }
  if (!r.answers || typeof r.answers !== 'object' || Array.isArray(r.answers)) {
    return { ok: false, error: 'card_response.answers must be an object' };
  }
  return { ok: true };
}
