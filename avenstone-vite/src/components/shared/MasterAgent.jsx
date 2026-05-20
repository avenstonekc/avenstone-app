import { useState, useEffect, useRef } from 'react';
import { sb, AI_MASTER_URL, ANON_KEY, captureFailedIntent, SUBMIT_BUG_REPORT_URL } from '../../lib/supabase';
import { pushBreadcrumb, getSnapshot } from '../../lib/bugContext';
import { Ic } from '../../lib/utils';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { TextToSpeech, QueueStrategy } from '@capacitor-community/text-to-speech';
import { validatePendingCard, formatCardAnswers } from '../../lib/agentCards';

function normalizeTtsText(text) {
  return (text || '')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/\*\*|__/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/^#+\s/gm, '')
    .replace(/✓/g, '')
    .replace(/·/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

const VC_AFFIRMATIVE = new Set(['yes', 'yeah', 'yep', 'confirm', 'do it', 'go ahead', 'sure', 'ok', 'okay']);
const VC_NEGATIVE    = new Set(['no', 'nope', 'cancel', "don't", 'stop']);

function getStoredVoiceUri() {
  try { return localStorage.getItem('av_tts_voice_uri') || ''; } catch { return ''; }
}

// Returns the index into the full getSupportedVoices() array for the stored voice,
// falling back to the best Enhanced/Premium en-US voice, then any en-US, then any en-*.
function pickVoiceIndex(voices, storedUri) {
  if (storedUri) {
    const idx = voices.findIndex(v => v.voiceURI === storedUri);
    if (idx >= 0) return idx;
  }
  let best = voices.findIndex(v => v.lang === 'en-US' && /(enhanced|premium)/i.test(v.name));
  if (best < 0) best = voices.findIndex(v => v.lang === 'en-US');
  if (best < 0) best = voices.findIndex(v => v.lang.startsWith('en'));
  return best >= 0 ? best : undefined;
}

// Anthropic vision: jpeg/png/gif/webp only. iOS exports HEIC by default.
const MAX_EDGE = 1024;
const ANTHROPIC_OK = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

async function fileToVisionPayload(file) {
  let working = file;
  let mime = file.type || 'image/jpeg';
  if (/heic|heif/i.test(mime) || /\.heic$|\.heif$/i.test(file.name)) {
    const heic2any = (await import('heic2any')).default;
    const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
    working = blob instanceof Blob ? blob : blob[0];
    mime = 'image/jpeg';
  }
  if (!ANTHROPIC_OK.has(mime)) mime = 'image/jpeg';
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(working);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL('image/jpeg', 0.85);
  return { base64: out.split(',')[1], mime: 'image/jpeg', preview: out };
}

// Tile click sets the chat input to a starter prompt; user completes the
// sentence and hits Enter. The agent infers the verb + fields from the freeform
// input and surfaces a Confirm card via pending_action when ready to write.
const TILE_PREFIXES = {
  receipt:      'Log a receipt for ',
  todo:         'Add a todo: ',
  lead:         'New lead — ',
  change_order: 'Submit a change order on ',
  // bug is the only special path: it does NOT go through ai-master-agent.
  // Tile click captures screenshot + bug context immediately, sets bugMode true,
  // and the next sendMessage routes the description to submit-bug-report.
};

const QUICK_TILES = [
  { verb: 'receipt',      label: 'Add a receipt',         ic: 'note' },
  { verb: 'todo',         label: 'Add to the todo list',  ic: 'check' },
  { verb: 'lead',         label: 'Add a new lead',        ic: 'plus' },
  { verb: 'change_order', label: 'Submit a change order', ic: 'warn' },
  { verb: 'bug',          label: 'Submit a bug',          ic: 'info' },
];

function formatToolName(tool) {
  if (!tool) return tool;
  return tool
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getResultSummary(result) {
  if (!result) return '';
  if (result.error) return result.error;
  if (result.message) return result.message;
  if (result.id) return `ID: ${result.id}`;
  try {
    const str = JSON.stringify(result);
    return str.length > 80 ? str.slice(0, 77) + '...' : str;
  } catch {
    return '';
  }
}

function TypingDots() {
  const dotStyle = (delay) => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#C9A84C',
    display: 'inline-block',
    margin: '0 2px',
    animation: 'masterAgentBounce 1.2s infinite',
    animationDelay: delay,
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px' }}>
      <span style={dotStyle('0s')} />
      <span style={dotStyle('0.2s')} />
      <span style={dotStyle('0.4s')} />
    </div>
  );
}

function ActionsPanel({ actions }) {
  const [open, setOpen] = useState(false);
  if (!actions || actions.length === 0) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#7BA7D4',
          fontSize: 11,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        <span style={{ color: '#4CAF50', fontWeight: 700 }}>✓</span>
        {actions.length} action{actions.length !== 1 ? 's' : ''} taken
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div
          style={{
            marginTop: 5,
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 6,
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {actions.map((action, i) => {
            const isError = action.result && action.result.error;
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  fontSize: 11,
                  fontFamily: 'DM Sans, sans-serif',
                  color: '#A0B8D0',
                }}
              >
                <span style={{ color: isError ? '#EF5350' : '#4CAF50', flexShrink: 0 }}>
                  {isError ? '✗' : '✓'}
                </span>
                <span>
                  <span style={{ color: '#C9A84C', fontWeight: 600 }}>
                    {formatToolName(action.tool)}
                  </span>
                  {' — '}
                  <span>{getResultSummary(action.result)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// AgentCard — renders a pending_card emitted by ai-master-agent.
// Supports select (button group), radio_per_item (table of rows × options),
// and text (single-line input — used by Phase 4 missing-field form cards).
// Submit is disabled until every question has a complete answer.
// Cancel reverts to plain text turns (arc guard rail).
function AgentCard({ card, onSubmit, onCancel, loading }) {
  const [answers, setAnswers] = useState({});

  const isComplete = card.questions.every(q => {
    if (q.optional) return true;
    if (q.type === 'select') return answers[q.id] != null;
    if (q.type === 'text') {
      const v = answers[q.id];
      return typeof v === 'string' && v.trim().length > 0;
    }
    if (q.type === 'radio_per_item') {
      const perItem = answers[q.id] || {};
      return (q.items || []).every(item => perItem[item.id] != null);
    }
    return false;
  });

  const setSelect = (qId, value) => setAnswers(prev => ({ ...prev, [qId]: value }));
  const setText = (qId, value) => setAnswers(prev => ({ ...prev, [qId]: value }));
  const setRadioItem = (qId, itemId, value) => setAnswers(prev => ({
    ...prev,
    [qId]: { ...(prev[qId] || {}), [itemId]: value },
  }));

  return (
    <div
      style={{
        marginTop: 4,
        background: 'rgba(201,168,76,0.12)',
        border: '1px solid rgba(201,168,76,0.45)',
        borderRadius: 12,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.2,
          color: '#C9A84C',
          textTransform: 'uppercase',
        }}
      >
        Answer required
      </div>
      <div
        style={{
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 14,
          color: '#F7F5F0',
          lineHeight: 1.5,
        }}
      >
        {card.prompt}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {card.questions.map(q => (
          <div key={q.id}>
            <div
              style={{
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 12,
                color: 'rgba(247,245,240,0.6)',
                marginBottom: 7,
              }}
            >
              {q.label}
            </div>

            {q.type === 'select' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {q.options.map(opt => {
                  const sel = answers[q.id] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSelect(q.id, opt.value)}
                      style={{
                        padding: '6px 13px',
                        borderRadius: 20,
                        border: sel ? '1px solid #C9A84C' : '1px solid rgba(247,245,240,0.2)',
                        background: sel ? '#C9A84C' : 'transparent',
                        color: sel ? '#0A1F44' : 'rgba(247,245,240,0.8)',
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 13,
                        fontWeight: sel ? 700 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.13s',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === 'text' && (
              <input
                type="text"
                value={answers[q.id] || ''}
                onChange={e => setText(q.id, e.target.value)}
                placeholder={q.label}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(247,245,240,0.2)',
                  background: 'rgba(247,245,240,0.06)',
                  color: '#F7F5F0',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 16,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            )}

            {q.type === 'radio_per_item' && (
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 12,
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: 'left',
                          color: 'rgba(247,245,240,0.4)',
                          padding: '3px 6px 6px',
                          fontWeight: 500,
                        }}
                      >
                        Item
                      </th>
                      {q.options.map(opt => (
                        <th
                          key={opt.value}
                          style={{
                            color: 'rgba(247,245,240,0.4)',
                            padding: '3px 6px 6px',
                            fontWeight: 500,
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {opt.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(q.items || []).map(item => {
                      const perItem = answers[q.id] || {};
                      return (
                        <tr
                          key={item.id}
                          style={{ borderTop: '1px solid rgba(247,245,240,0.08)' }}
                        >
                          <td
                            style={{
                              color: '#F7F5F0',
                              padding: '7px 6px',
                              verticalAlign: 'middle',
                            }}
                          >
                            {item.label}
                          </td>
                          {q.options.map(opt => {
                            const sel = perItem[item.id] === opt.value;
                            return (
                              <td
                                key={opt.value}
                                style={{
                                  textAlign: 'center',
                                  padding: '7px 6px',
                                  verticalAlign: 'middle',
                                }}
                              >
                                <button
                                  onClick={() => setRadioItem(q.id, item.id, opt.value)}
                                  aria-label={`${item.label}: ${opt.label}`}
                                  style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: '50%',
                                    border: sel
                                      ? '2px solid #C9A84C'
                                      : '2px solid rgba(247,245,240,0.25)',
                                    background: sel ? '#C9A84C' : 'transparent',
                                    cursor: 'pointer',
                                    padding: 0,
                                    display: 'inline-block',
                                    transition: 'all 0.13s',
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onSubmit(answers)}
          disabled={!isComplete || loading}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            background: isComplete && !loading ? '#C9A84C' : 'rgba(201,168,76,0.3)',
            color: '#0A1F44',
            border: 'none',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 13,
            fontWeight: 700,
            cursor: isComplete && !loading ? 'pointer' : 'default',
          }}
        >
          Submit
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            background: 'transparent',
            color: 'rgba(247,245,240,0.75)',
            border: '1px solid rgba(247,245,240,0.25)',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function MasterAgent({ profile, pendingAction, clearPendingAction }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPulse, setShowPulse] = useState(true);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [pendingCard, setPendingCard] = useState(null);
  const [attachment, setAttachment] = useState(null); // { base64, mime, preview }
  const [attaching, setAttaching] = useState(false);
  const [attachErr, setAttachErr] = useState('');
  const [toast, setToast] = useState('');
  const [bugMode, setBugMode] = useState(false);
  const bugContextRef = useRef(null);
  const threadRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const [micAvailable, setMicAvailable] = useState(false);
  const [micListening, setMicListening] = useState(false);
  const [micError, setMicError] = useState('');
  const [micHint, setMicHint] = useState('');
  const micBaseTextRef = useRef('');
  const micListenersRef = useRef([]);
  const liveTranscriptRef = useRef('');
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    try { return localStorage.getItem('av_tts_enabled') !== 'false'; } catch { return true; }
  });
  const [vcListening, setVcListening] = useState(false);
  const vcTimerRef      = useRef(null);
  const vcListenersRef  = useRef([]);
  const vcPendingRef    = useRef(null); // action held for STT callback
  const voicesCacheRef  = useRef(null); // full getSupportedVoices() array, loaded on first speak

  const isMob = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    const timer = setTimeout(() => setShowPulse(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current && inputRef.current.focus(), 120);
    }
  }, [open]);

  useEffect(() => {
    if (pendingAction?.kind === 'master_agent_tool_call') {
      setInput(pendingAction.payload?.user_message || '');
      setOpen(true);
      clearPendingAction?.();
    }
  }, [pendingAction]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    SpeechRecognition.available().then(({ available }) => setMicAvailable(available)).catch(() => {});
    return () => {
      micListenersRef.current.forEach((h) => h.remove().catch(() => {}));
      vcListenersRef.current.forEach((h) => h.remove().catch(() => {}));
      if (vcTimerRef.current) clearTimeout(vcTimerRef.current);
      SpeechRecognition.stop().catch(() => {});
    };
  }, []);

  const callMaster = async (body, userMessageText) => {
    setLoading(true);
    try {
      const res = await fetch(AI_MASTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      const aiText = data.response || 'No response.';
      const aiActions = data.actions || [];

      aiActions.forEach(action => {
        if (action.result?.error) {
          captureFailedIntent({
            kind: 'master_agent_tool_call',
            payload: { tool_name: action.tool, error_message: action.result.error, user_message: userMessageText },
            message: action.result.error,
          }).catch(() => {});
        }
      });

      setMessages((prev) => [
        ...prev,
        { type: 'ai', text: aiText, actions: aiActions },
      ]);
      // Append the assistant turn to history for BOTH normal and pending_card
      // responses. When a pending_card is present, this ensures the model sees
      // [assistant: card question] → [user: formatted answers] on the next turn.
      setConversationHistory((prev) => [
        ...prev,
        { role: 'assistant', content: aiText },
      ]);
      const pendingAction = data.pending_action || null;
      setPendingConfirm(pendingAction);

      // pending_card — structured question surface (separate from pending_action).
      const rawCard = data.pending_card || null;
      if (rawCard) {
        const validation = validatePendingCard(rawCard);
        setPendingCard(validation.ok ? rawCard : null);
      } else {
        setPendingCard(null);
      }

      if (pendingAction && ttsEnabled) {
        vcPendingRef.current = pendingAction;
        // Suppress response text — card description carries the canonical money readback.
        // Speaking both would say the amount twice.
        ttsSpeak(null, pendingAction.description).then(() => startVoiceConfirm(pendingAction));
      } else {
        ttsSpeak(aiText, null);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { type: 'ai', text: 'Something went wrong. Please try again.', actions: [] },
      ]);
      setPendingConfirm(null);
    } finally {
      setLoading(false);
    }
  };

  const submitBug = async (description) => {
    setLoading(true);
    try {
      const { data: { session } } = await sb.auth.getSession();
      const jwt = session?.access_token;
      const ctx = bugContextRef.current || {};
      const res = await fetch(SUBMIT_BUG_REPORT_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          route: ctx.route || 'master-agent',
          app_version: ctx.version || '1.0.0',
          device_info: `${ctx.device || ''} ${ctx.os || ''}`.trim(),
          breadcrumbs: ctx.breadcrumbs || [],
          console_errors: ctx.consoleErrors || [],
          network_errors: ctx.networkErrors || [],
          screenshot_dataurl: ctx.screenshot_dataurl || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessages((prev) => [...prev, { type: 'ai', text: `Bug submission failed: ${data.error || 'unknown error'}`, actions: [] }]);
      } else {
        setToast('Bug submitted ✓');
        setTimeout(() => setToast(''), 4000);
        setMessages((prev) => [...prev, { type: 'ai', text: 'Bug report submitted. Thanks — we\'ll look into it.', actions: [] }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { type: 'ai', text: 'Bug submission failed. Please try again.', actions: [] }]);
    } finally {
      setBugMode(false);
      bugContextRef.current = null;
      setLoading(false);
    }
  };

  const sendMessage = async (text) => {
    const trimmed = (text || input).trim();
    if (loading) return;
    if (!trimmed && !attachment) return;
    TextToSpeech.stop().catch(() => {});
    stopVoiceConfirm();
    if (pendingConfirm) setPendingConfirm(null);
    if (pendingCard) setPendingCard(null);

    // Bug submission path — bypass agent, go straight to submit-bug-report.
    if (bugMode) {
      if (trimmed.length < 10) {
        setMessages((prev) => [...prev, { type: 'ai', text: 'Please describe what happened in at least 10 characters.', actions: [] }]);
        return;
      }
      setMessages((prev) => [...prev, { type: 'user', text: trimmed }]);
      setInput('');
      await submitBug(trimmed);
      return;
    }

    const messageContent = attachment
      ? [
          { type: 'image', source: { type: 'base64', media_type: attachment.mime, data: attachment.base64 } },
          ...(trimmed ? [{ type: 'text', text: trimmed }] : []),
        ]
      : trimmed;

    const userMsg = { role: 'user', content: messageContent };
    const newHistory = [...conversationHistory, userMsg];

    const displayText = trimmed || (attachment ? '[image attached]' : '');
    setMessages((prev) => [...prev, { type: 'user', text: displayText, image: attachment?.preview || null }]);
    setConversationHistory(newHistory);
    setInput('');
    setAttachment(null);
    setAttachErr('');

    await callMaster({
      user_id: profile?.id,
      tenant_id: profile?.tenant_id,
      role: profile?.role,
      full_name: profile?.full_name,
      message: messageContent,
      conversation_history: newHistory,
    }, displayText);
  };

  const onAttachClick = () => fileRef.current?.click();

  const onFilePicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAttachErr('');
    setAttaching(true);
    try {
      const payload = await fileToVisionPayload(file);
      // Anthropic 5MB ceiling per image (base64 expands ~33%); after canvas resize at 1024px JPEG-85 we're well under.
      if (payload.base64.length > 5 * 1024 * 1024 * 1.34) {
        setAttachErr('Image too large after compression. Try a smaller photo.');
        setAttaching(false);
        return;
      }
      setAttachment(payload);
    } catch (err) {
      setAttachErr('Could not read image. HEIC, JPG, PNG only.');
    } finally {
      setAttaching(false);
    }
  };

  const removeAttachment = () => {
    setAttachment(null);
    setAttachErr('');
  };

  const confirmPending = async () => {
    if (!pendingConfirm || loading) return;
    const action = pendingConfirm;
    setPendingConfirm(null);
    setMessages((prev) => [...prev, { type: 'user', text: 'Confirmed.' }]);
    await callMaster({
      user_id: profile?.id,
      tenant_id: profile?.tenant_id,
      role: profile?.role,
      full_name: profile?.full_name,
      pending_action: action,
      confirmed: true,
    }, action.description || action.tool);
  };

  const cancelPending = () => {
    if (!pendingConfirm) return;
    setPendingConfirm(null);
    setMessages((prev) => [
      ...prev,
      { type: 'ai', text: 'Cancelled. Nothing was saved.', actions: [] },
    ]);
  };

  // submitCard — send card answers back through runAgentLoop so Claude can
  // use the structured input to call the intended tool.
  // conversationHistory already ends with the assistant turn that prompted the
  // card; we append the formatted answers as a user turn before sending so the
  // model sees [assistant: question] → [user: answers].
  const submitCard = async (answers) => {
    if (!pendingCard || loading) return;
    const card = pendingCard;
    setPendingCard(null);

    const answersText = formatCardAnswers(card, answers);
    setMessages((prev) => [...prev, { type: 'user', text: 'Card submitted.' }]);

    const newHistory = [
      ...conversationHistory,
      { role: 'user', content: answersText },
    ];
    setConversationHistory(newHistory);

    await callMaster(
      {
        user_id: profile?.id,
        tenant_id: profile?.tenant_id,
        role: profile?.role,
        full_name: profile?.full_name,
        card_response: { card_id: card.id, answers, meta: card.meta || undefined },
        conversation_history: newHistory,
      },
      `Card ${card.id} answered`,
    );
  };

  const cancelCard = () => {
    if (!pendingCard) return;
    setPendingCard(null);
    setMessages((prev) => [
      ...prev,
      { type: 'ai', text: 'Cancelled. Nothing was saved.', actions: [] },
    ]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startMic = async () => {
    if (loading) return;
    // Self-heal any stuck state left by a prior pointercancel/touchcancel
    micListenersRef.current.forEach((h) => h.remove().catch(() => {}));
    micListenersRef.current = [];
    try { await SpeechRecognition.stop(); } catch {}
    TextToSpeech.stop().catch(() => {});
    setMicError('');
    setMicHint('');
    let perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== 'granted') {
      perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== 'granted') {
        setMicError('Microphone access denied — enable in iOS Settings.');
        return;
      }
      setMicHint('Press and hold to speak.');
      return;
    }
    micBaseTextRef.current = input;
    liveTranscriptRef.current = input;
    const partialHandle = await SpeechRecognition.addListener('partialResults', (evt) => {
      const text = evt.matches?.[0] ?? '';
      if (!text) return;
      const base = micBaseTextRef.current;
      const full = base ? base + ' ' + text : text;
      liveTranscriptRef.current = full;
      setInput(full);
    });
    const errHandle = await SpeechRecognition.addListener('error', (evt) => {
      setMicError(evt.message || 'Speech recognition error.');
      setMicListening(false);
    });
    micListenersRef.current = [partialHandle, errHandle];
    setMicListening(true);
    SpeechRecognition.start({ language: 'en-US', partialResults: true }).catch((err) => {
      setMicError(err?.message || 'Could not start recognition.');
      setMicListening(false);
    });
  };

  const stopMic = async () => {
    if (!micListening) return;
    micListenersRef.current.forEach((h) => h.remove().catch(() => {}));
    micListenersRef.current = [];
    setMicListening(false);
    SpeechRecognition.stop().catch(() => {});
    const transcript = liveTranscriptRef.current.trim();
    liveTranscriptRef.current = '';
    const isJunk = !transcript || transcript.length < 2 || /^[^a-zA-Z0-9]+$/.test(transcript);
    if (isJunk) {
      setInput('');
    } else {
      sendMessage(transcript);
    }
  };

  const stopVoiceConfirm = () => {
    if (vcTimerRef.current) { clearTimeout(vcTimerRef.current); vcTimerRef.current = null; }
    vcListenersRef.current.forEach((h) => h.remove().catch(() => {}));
    vcListenersRef.current = [];
    vcPendingRef.current = null;
    setVcListening(false);
    SpeechRecognition.stop().catch(() => {});
  };

  const ttsSpeak = async (primary, secondary) => {
    if (!ttsEnabled) return;
    if (!voicesCacheRef.current) {
      const { voices } = await TextToSpeech.getSupportedVoices().catch(() => ({ voices: [] }));
      voicesCacheRef.current = voices || [];
    }
    const voiceIdx = pickVoiceIndex(voicesCacheRef.current, getStoredVoiceUri());
    const voiceParam = voiceIdx !== undefined ? { voice: voiceIdx } : {};
    const t1 = normalizeTtsText(primary);
    if (t1) await TextToSpeech.speak({ text: t1, lang: 'en-US', rate: 1.0, category: 'playback', queueStrategy: QueueStrategy.Flush, ...voiceParam }).catch(() => {});
    if (secondary) {
      const t2 = normalizeTtsText(secondary);
      if (t2) await TextToSpeech.speak({ text: t2, lang: 'en-US', rate: 1.0, category: 'playback', queueStrategy: QueueStrategy.Add, ...voiceParam }).catch(() => {});
    }
  };

  const startVoiceConfirm = async (action) => {
    if (!action || !ttsEnabled || !micAvailable) return;
    await new Promise((r) => setTimeout(r, 500));
    if (!vcPendingRef.current) return; // cleared during cooldown (user tapped or new message)
    try {
      setVcListening(true);
      const partialHandle = await SpeechRecognition.addListener('partialResults', ({ matches }) => {
        if (!matches || matches.length === 0) return;
        const raw = matches[0].toLowerCase().trim();
        if (VC_AFFIRMATIVE.has(raw)) {
          const a = vcPendingRef.current;
          if (!a) return;
          stopVoiceConfirm();
          setPendingConfirm(null);
          setMessages((prev) => [...prev, { type: 'user', text: 'Confirmed.' }]);
          callMaster({
            user_id: profile?.id,
            tenant_id: profile?.tenant_id,
            role: profile?.role,
            full_name: profile?.full_name,
            pending_action: a,
            confirmed: true,
          }, a.description || a.tool);
        } else if (VC_NEGATIVE.has(raw)) {
          if (!vcPendingRef.current) return;
          stopVoiceConfirm();
          setPendingConfirm(null);
          setMessages((prev) => [...prev, { type: 'ai', text: 'Cancelled. Nothing was saved.', actions: [] }]);
        }
      });
      vcListenersRef.current.push(partialHandle);
      await SpeechRecognition.start({ partialResults: true, popup: false }).catch(() => {});
      vcTimerRef.current = setTimeout(() => stopVoiceConfirm(), 5000);
    } catch {
      setVcListening(false);
      vcPendingRef.current = null;
    }
  };

  const toggleTts = () => {
    setTtsEnabled((v) => {
      const next = !v;
      try { localStorage.setItem('av_tts_enabled', String(next)); } catch {}
      if (!next) TextToSpeech.stop().catch(() => {});
      return next;
    });
  };

  const handleTileClick = (verb) => {
    pushBreadcrumb({ type: 'tap', label: `tile:${verb}`, route: 'master-agent' });
    if (verb === 'bug') {
      // Capture screenshot + bug context at click time — screen changes during chat.
      const snap = getSnapshot();
      bugContextRef.current = { ...snap };
      import('html2canvas').then(({ default: html2canvas }) => {
        html2canvas(document.body, { scale: 0.5, useCORS: true, logging: false })
          .then(canvas => {
            bugContextRef.current = { ...snap, screenshot_dataurl: canvas.toDataURL('image/png') };
          })
          .catch(() => {});
      }).catch(() => {});
      setBugMode(true);
      setInput('');
      setMessages((prev) => [...prev, {
        type: 'ai',
        text: 'Got it — what were you trying to do, and what happened? (min 10 characters)',
        actions: [],
      }]);
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }
    setInput(TILE_PREFIXES[verb] || '');
    setTimeout(() => {
      inputRef.current?.focus();
      const el = inputRef.current;
      if (el && typeof el.setSelectionRange === 'function') {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }, 50);
  };

  const clearChat = () => {
    setMessages([]);
    setConversationHistory([]);
    setPendingConfirm(null);
    setPendingCard(null);
    setBugMode(false);
    bugContextRef.current = null;
  };

  const panelVisible = open;
  const panelStyle = isMob
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0A1F44',
        display: 'flex',
        flexDirection: 'column',
        opacity: panelVisible ? 1 : 0,
        pointerEvents: panelVisible ? 'auto' : 'none',
        transition: 'opacity 0.2s ease',
      }
    : {
        position: 'fixed',
        top: 60,
        right: 0,
        width: 420,
        height: 'calc(100vh - 60px)',
        zIndex: 9999,
        background: '#0A1F44',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(10,31,68,0.6)',
        transform: panelVisible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.2s ease',
        pointerEvents: panelVisible ? 'auto' : 'none',
      };

  const hasMessages = messages.length > 0;

  return (
    <>
      <style>{`
        @keyframes masterAgentPulse {
          0% { transform: scale(1); opacity: 0.7; }
          70% { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes masterAgentBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>

      {/* Floating Trigger Button */}
      <div
        style={{
          position: 'fixed',
          bottom: 90,
          right: 18,
          zIndex: 9998,
          width: 52,
          height: 52,
        }}
      >
        {showPulse && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px solid #C9A84C',
              animation: 'masterAgentPulse 1.4s ease-out 2',
              pointerEvents: 'none',
            }}
          />
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          title="Open AI Command Panel (Ctrl+K)"
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: '#060F22',
            border: '2px solid #C9A84C',
            boxShadow: '0 4px 24px rgba(10,31,68,0.5)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            lineHeight: 1,
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.08)';
            e.currentTarget.style.boxShadow = '0 6px 30px rgba(201,168,76,0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 24px rgba(10,31,68,0.5)';
          }}
        >
          ✦
        </button>
      </div>

      {/* Overlay backdrop on mobile */}
      {isMob && open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            background: 'rgba(0,0,0,0.5)',
          }}
        />
      )}

      {/* Command Panel */}
      <div style={panelStyle}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: isMob ? 'max(18px, calc(env(safe-area-inset-top) + 8px)) 20px 14px' : '18px 20px 14px',
            borderBottom: '1px solid rgba(201,168,76,0.2)',
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'DM Serif Display, serif',
                fontSize: 24,
                color: '#F7F5F0',
                lineHeight: 1.2,
                marginBottom: 0,
              }}
            >
              What can I help you with?
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {hasMessages && (
              <button
                onClick={clearChat}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'rgba(247,245,240,0.35)',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12,
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Clear chat
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(247,245,240,0.6)',
                fontSize: 20,
                lineHeight: 1,
                padding: '10px 12px',
                minWidth: 44,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#F7F5F0')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(247,245,240,0.6)')}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Thread */}
        <div
          ref={threadRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 16px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(201,168,76,0.2) transparent',
          }}
        >
          {!hasMessages && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 8 }}>
              {/* Quick-action tile grid — tiles set the chat input to a starter
                  prompt; user types the rest and hits Enter. */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 10,
              }}>
                {QUICK_TILES.map(tile => (
                  <button
                    key={tile.verb}
                    onClick={() => handleTileClick(tile.verb)}
                    style={{
                      background: '#fff',
                      border: '1px solid #E8E4DC',
                      borderRadius: 12,
                      padding: 16,
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      transition: 'background 0.13s, border-color 0.13s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F7F5F0'; e.currentTarget.style.borderColor = '#C9A84C'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E8E4DC'; }}
                  >
                    <span style={{ width: 20, height: 20, display: 'flex', color: '#0A1F44' }}>{Ic[tile.ic]}</span>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 500, color: '#0A1F44', lineHeight: 1.3 }}>{tile.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.type === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '82%',
                  padding: '10px 14px',
                  borderRadius: msg.type === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: msg.type === 'user' ? '#C9A84C' : '#0F2A5C',
                  color: msg.type === 'user' ? '#0A1F44' : '#F7F5F0',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 14,
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {msg.image && (
                  <img
                    src={msg.image}
                    alt="attachment"
                    style={{ maxWidth: '100%', borderRadius: 10, marginBottom: msg.text ? 8 : 0, display: 'block' }}
                  />
                )}
                {msg.text}
                {msg.type === 'ai' && <ActionsPanel actions={msg.actions} />}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div
                style={{
                  background: '#0F2A5C',
                  borderRadius: '18px 18px 18px 4px',
                  overflow: 'hidden',
                }}
              >
                <TypingDots />
              </div>
            </div>
          )}

          {pendingConfirm && !loading && (
            <div
              style={{
                marginTop: 4,
                background: 'rgba(201,168,76,0.12)',
                border: '1px solid rgba(201,168,76,0.45)',
                borderRadius: 12,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  color: '#C9A84C',
                  textTransform: 'uppercase',
                }}
              >
                Confirm action
              </div>
              <div
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 14,
                  color: '#F7F5F0',
                  lineHeight: 1.5,
                }}
              >
                {pendingConfirm.description || `Run ${formatToolName(pendingConfirm.tool)}?`}
              </div>
              {vcListening && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#C9A84C',
                    animation: 'masterAgentBounce 1.2s infinite',
                  }} />
                  <span style={{
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 11,
                    color: 'rgba(201,168,76,0.85)',
                    fontStyle: 'italic',
                  }}>
                    Listening… say yes or no
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { stopVoiceConfirm(); confirmPending(); }}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#C9A84C',
                    color: '#0A1F44',
                    border: 'none',
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Confirm
                </button>
                <button
                  onClick={() => { stopVoiceConfirm(); cancelPending(); }}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'transparent',
                    color: 'rgba(247,245,240,0.75)',
                    border: '1px solid rgba(247,245,240,0.25)',
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {pendingCard && !loading && (
            <AgentCard
              card={pendingCard}
              onSubmit={submitCard}
              onCancel={cancelCard}
              loading={loading}
            />
          )}
        </div>

        {/* Generic toast (bug submitted, etc.) */}
        {toast && (
          <div style={{ margin: '0 16px 8px', padding: '10px 14px', background: '#D1FAE5', border: '1px solid #22c55e', borderRadius: 8, fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#166534' }}>
            {toast}
          </div>
        )}

        {/* Helper hint — shown when no messages */}
        {!hasMessages && !loading && (
          <div style={{ padding: '0 16px 8px', fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#6b7280' }}>
            Tap an option above, or type below.
          </div>
        )}

        {/* Input Bar */}
        <div
          style={{
            padding: '10px 14px 16px',
            borderTop: '1px solid rgba(201,168,76,0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            flexShrink: 0,
          }}
        >
          {(attachment || attaching || attachErr || micError || micHint) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {attaching && (
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'rgba(247,245,240,0.55)' }}>Processing image…</span>
              )}
              {attachment && !attaching && (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={attachment.preview} alt="attachment preview" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(201,168,76,0.45)' }} />
                  <button
                    onClick={removeAttachment}
                    aria-label="Remove attachment"
                    style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#0A1F44', border: '1px solid #C9A84C', color: '#F7F5F0', fontSize: 11, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                  >×</button>
                </div>
              )}
              {attachErr && (
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#FCA5A5' }}>{attachErr}</span>
              )}
              {micError && (
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#FCA5A5' }}>{micError}</span>
              )}
              {micHint && !micError && (
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'rgba(247,245,240,0.55)' }}>{micHint}</span>
              )}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            onChange={onFilePicked}
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <button
            onClick={onAttachClick}
            disabled={loading || attaching}
            title="Attach image"
            aria-label="Attach image"
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(201,168,76,0.3)',
              color: 'rgba(247,245,240,0.75)',
              cursor: loading || attaching ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginBottom: 2,
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => { if (!loading && !attaching) e.currentTarget.style.borderColor = 'rgba(201,168,76,0.6)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.3)'; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={bugMode ? 'Describe the bug (min 10 characters)…' : 'Tell me what to do...'}
            disabled={loading}
            style={{
              flex: 1,
              resize: 'none',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(201,168,76,0.2)',
              borderRadius: 12,
              padding: '10px 12px',
              color: '#F7F5F0',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 14,
              lineHeight: 1.5,
              outline: 'none',
              transition: 'border-color 0.15s',
              scrollbarWidth: 'none',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'rgba(201,168,76,0.55)')}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(201,168,76,0.2)')}
          />
          {micAvailable && (
            <button
              onClick={() => micListening ? stopMic() : startMic()}
              onContextMenu={(e) => e.preventDefault()}
              disabled={loading}
              title={micListening ? 'Tap to stop' : 'Tap to speak'}
              aria-label={micListening ? 'Tap to stop' : 'Tap to speak'}
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: micListening ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.07)',
                border: micListening ? '1px solid rgba(239,68,68,0.7)' : '1px solid rgba(201,168,76,0.3)',
                color: micListening ? '#FCA5A5' : 'rgba(247,245,240,0.75)',
                cursor: loading ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginBottom: 2,
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              {micListening ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="9" y="3" width="6" height="18" rx="3" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
          )}
          <button
            onClick={toggleTts}
            title={ttsEnabled ? 'Mute agent voice' : 'Unmute agent voice'}
            aria-label={ttsEnabled ? 'Mute agent voice' : 'Unmute agent voice'}
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: ttsEnabled ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
              border: ttsEnabled ? '1px solid rgba(201,168,76,0.3)' : '1px solid rgba(247,245,240,0.15)',
              color: ttsEnabled ? 'rgba(247,245,240,0.75)' : 'rgba(247,245,240,0.3)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginBottom: 2,
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            {ttsEnabled ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            )}
          </button>
          <button
            onClick={() => sendMessage()}
            disabled={loading || (!input.trim() && !attachment)}
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: loading || (!input.trim() && !attachment) ? 'rgba(201,168,76,0.3)' : '#C9A84C',
              border: 'none',
              cursor: loading || (!input.trim() && !attachment) ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.15s, transform 0.1s',
              marginBottom: 2,
            }}
            onMouseEnter={(e) => {
              if (!loading && (input.trim() || attachment)) e.currentTarget.style.transform = 'scale(1.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
            aria-label="Send"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke={loading || (!input.trim() && !attachment) ? 'rgba(10,31,68,0.5)' : '#0A1F44'}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
          </div>
        </div>
      </div>
    </>
  );
}
