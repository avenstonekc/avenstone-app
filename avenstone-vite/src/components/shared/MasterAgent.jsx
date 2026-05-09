import { useState, useEffect, useRef } from 'react';
import { AI_MASTER_URL, ANON_KEY, captureFailedIntent } from '../../lib/supabase';
import { pushBreadcrumb } from '../../lib/bugContext';
import { Ic } from '../../lib/utils';

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

const QUICK_TILES = [
  { verb: 'receipt',      label: 'Add a receipt',       ic: 'note' },
  { verb: 'todo',         label: 'Add to the todo list', ic: 'check' },
  { verb: 'lead',         label: 'Add a new lead',       ic: 'plus' },
  { verb: 'change_order', label: 'Submit a change order',ic: 'warn' },
  { verb: 'bug',          label: 'Submit a bug',         ic: 'info' },
];

// Stub PendingTaskList — real component built in commit 7
function PendingTaskList() { return null; }

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

export default function MasterAgent({ profile, pendingAction, clearPendingAction }) {
  const [open, setOpen] = useState(false);
  const [verb, setVerb] = useState(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPulse, setShowPulse] = useState(true);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [attachment, setAttachment] = useState(null); // { base64, mime, preview }
  const [attaching, setAttaching] = useState(false);
  const [attachErr, setAttachErr] = useState('');
  const threadRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

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
      setConversationHistory((prev) => [
        ...prev,
        { role: 'assistant', content: aiText },
      ]);
      setPendingConfirm(data.pending_action || null);
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

  const sendMessage = async (text) => {
    const trimmed = (text || input).trim();
    if (loading) return;
    if (!trimmed && !attachment) return;
    if (pendingConfirm) setPendingConfirm(null);

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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setConversationHistory([]);
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
        top: 0,
        right: 0,
        width: 420,
        height: '100vh',
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
            padding: '18px 20px 14px',
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
                padding: '2px 4px',
                borderRadius: 4,
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
              {/* Pending task list (built commit 7) */}
              <PendingTaskList />

              {/* Quick-action tile grid */}
              {!verb && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 10,
                }}>
                  {QUICK_TILES.map(tile => (
                    <button
                      key={tile.verb}
                      onClick={() => {
                        setVerb(tile.verb);
                        pushBreadcrumb({ type: 'tap', label: `tile:${tile.verb}`, route: 'master-agent' });
                      }}
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
              )}

              {/* Verb stub — replaced commits 6–11 */}
              {verb && (
                <div style={{
                  background: 'rgba(247,245,240,0.08)',
                  border: '1px solid rgba(201,168,76,0.3)',
                  borderRadius: 10,
                  padding: 16,
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 14,
                  color: 'rgba(247,245,240,0.75)',
                }}>
                  <div style={{ marginBottom: 10 }}>Wired in next commit — verb: <strong style={{ color: '#C9A84C' }}>{verb}</strong></div>
                  <button
                    onClick={() => setVerb(null)}
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '6px 12px', color: '#F7F5F0', fontFamily: 'DM Sans, sans-serif', fontSize: 12, cursor: 'pointer' }}
                  >
                    ← Back
                  </button>
                </div>
              )}
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
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={confirmPending}
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
                  onClick={cancelPending}
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
        </div>

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
          {(attachment || attaching || attachErr) && (
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
            placeholder="Tell me what to do..."
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
