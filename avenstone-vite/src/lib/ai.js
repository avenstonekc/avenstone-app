import { AI_ESTIMATOR_URL } from './supabase';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ';
const authHeader = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` });

/**
 * Send messages to the AI estimator edge function and return the reply text.
 * @param {Array} messages - OpenAI-style message array
 * @returns {Promise<string>} assistant reply
 */
export const callEstimator = async (messages) => {
  const res = await fetch(AI_ESTIMATOR_URL, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ messages }),
  });
  const data = await res.json();
  return data.content || 'Sorry, something went wrong. Please try again.';
};

/**
 * Extract structured proposal data from an existing estimate conversation.
 * Sends a special EXTRACT_JSON_FOR_PROPOSAL signal to the AI.
 * @param {Array} estMessages - existing estimate message history
 * @returns {Promise<{ lineItems: Array, scope: Array }>}
 */
export const extractProposalData = async (estMessages) => {
  const extractMsgs = [...estMessages, { role: 'user', content: 'EXTRACT_JSON_FOR_PROPOSAL' }];
  const res = await fetch(AI_ESTIMATOR_URL, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ messages: extractMsgs }),
  });
  const data = await res.json();
  const raw = data.content || '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { lineItems: [], scope: [] };
  try {
    const parsed = JSON.parse(match[0]);
    return {
      lineItems: parsed.line_items || parsed.lineItems || [],
      scope: parsed.scope_items || parsed.scope || [],
    };
  } catch {
    return { lineItems: [], scope: [] };
  }
};
