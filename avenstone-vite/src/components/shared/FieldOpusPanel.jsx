// FIELD_OPUS_ARC Phase 5 — Dev console panel. Hard-gated to Kalin's auth ID.
// Returns null immediately for any other user.

import { useState, useEffect, useRef } from 'react';
import {
  sb,
  FIELD_OPUS_USER_ID,
  FIELD_OPUS_THREAD_ID,
  sbLoadFieldOpusThread,
  sbResetFieldOpusThread,
  FIELD_OPUS_CHAT_URL,
  FIELD_OPUS_DISPATCH_URL,
} from '../../lib/supabase';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { isMob } from '../../lib/utils';

const ghostBtn = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: 4,
  color: 'rgba(247,245,240,0.65)',
  fontSize: 13,
};

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------
function MessageBubble({ msg, dispatchingId, onDispatch, editingPrompt, setEditingPrompt }) {
  const [collapsed, setCollapsed] = useState(true);
  const [editText, setEditText] = useState(msg.meta?.draft_prompt?.prompt_text || '');

  const draftPrompt = msg.meta?.draft_prompt;
  const isDispatching = dispatchingId === msg.id;
  const isEditing = editingPrompt?.messageId === msg.id;

  if (msg.role === 'dispatch_result') {
    const isSuccess = msg.meta?.status === 'completed';
    return (
      <div style={{
        background: isSuccess ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
        border: `1px solid ${isSuccess ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 13,
        color: '#F7F5F0',
      }}>
        <div style={{ fontWeight: 700, marginBottom: 4, color: isSuccess ? '#4ade80' : '#f87171', fontSize: 12 }}>
          {isSuccess ? '✓ Dispatch complete' : '✗ Dispatch failed'}
          {msg.meta?.commit_hash ? ` — ${String(msg.meta.commit_hash).slice(0, 8)}` : ''}
        </div>
        <div style={{
          fontFamily: 'monospace',
          fontSize: 11,
          color: 'rgba(247,245,240,0.75)',
          whiteSpace: 'pre-wrap',
          maxHeight: collapsed ? 80 : 'none',
          overflow: collapsed ? 'hidden' : 'visible',
        }}>
          {msg.content}
        </div>
        <button onClick={() => setCollapsed(c => !c)} style={{ ...ghostBtn, fontSize: 11, marginTop: 4, padding: '2px 4px' }}>
          {collapsed ? 'Expand ↓' : 'Collapse ↑'}
        </button>
      </div>
    );
  }

  if (msg.role === 'system') {
    return (
      <div style={{
        background: 'rgba(247,245,240,0.05)',
        borderRadius: 6,
        padding: '6px 10px',
        fontSize: 12,
        color: 'rgba(247,245,240,0.45)',
        fontStyle: 'italic',
      }}>
        {msg.content}
      </div>
    );
  }

  if (msg.role === 'user') {
    return (
      <div style={{
        alignSelf: 'flex-end',
        maxWidth: '82%',
        background: 'rgba(201,168,76,0.15)',
        border: '1px solid rgba(201,168,76,0.3)',
        borderRadius: '10px 10px 2px 10px',
        padding: '8px 12px',
        fontSize: 14,
        color: '#F7F5F0',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content}
      </div>
    );
  }

  // assistant (and any unrecognized role)
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '94%', display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {msg.content && (
        <div style={{
          background: 'rgba(255,255,255,0.08)',
          borderRadius: '10px 10px 10px 2px',
          padding: '8px 12px',
          fontSize: 14,
          color: '#F7F5F0',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.5,
        }}>
          {msg.content}
        </div>
      )}
      {draftPrompt && (
        <div style={{
          background: 'rgba(6,20,44,0.9)',
          border: '1px solid rgba(201,168,76,0.55)',
          borderRadius: 10,
          padding: '12px 14px',
          width: '100%',
          boxSizing: 'border-box',
        }}>
          <div style={{ color: '#C9A84C', fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', marginBottom: 8 }}>
            SONNET PROMPT
          </div>
          {draftPrompt.scope_line && (
            <div style={{ fontSize: 11, color: 'rgba(247,245,240,0.55)', marginBottom: 6, fontFamily: 'monospace' }}>
              Scope: {draftPrompt.scope_line}
            </div>
          )}
          {isEditing ? (
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              rows={6}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(201,168,76,0.35)',
                borderRadius: 6,
                color: '#F7F5F0',
                fontSize: 12,
                fontFamily: 'monospace',
                padding: '8px',
                boxSizing: 'border-box',
                resize: 'vertical',
                outline: 'none',
                lineHeight: 1.4,
              }}
            />
          ) : (
            <div style={{
              fontSize: 12,
              color: 'rgba(247,245,240,0.85)',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'rgba(0,0,0,0.25)',
              borderRadius: 6,
              padding: 8,
              marginBottom: 8,
              maxHeight: 200,
              overflowY: 'auto',
              lineHeight: 1.45,
            }}>
              {draftPrompt.prompt_text}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {!isEditing ? (
              <>
                <button
                  onClick={() => onDispatch(msg.id, draftPrompt.prompt_text)}
                  disabled={!!dispatchingId}
                  style={{
                    background: '#C9A84C',
                    border: 'none',
                    borderRadius: 6,
                    color: '#0A1F44',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '7px 14px',
                    cursor: dispatchingId ? 'default' : 'pointer',
                    opacity: dispatchingId ? 0.6 : 1,
                  }}
                >
                  {isDispatching ? 'Sending…' : 'Send to VM'}
                </button>
                <button
                  onClick={() => {
                    setEditingPrompt({ messageId: msg.id, prompt: draftPrompt.prompt_text });
                    setEditText(draftPrompt.prompt_text);
                  }}
                  style={{ ...ghostBtn, border: '1px solid rgba(247,245,240,0.2)', fontSize: 12 }}
                >
                  Edit
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { onDispatch(msg.id, editText); setEditingPrompt(null); }}
                  disabled={!!dispatchingId || !editText.trim()}
                  style={{
                    background: '#C9A84C',
                    border: 'none',
                    borderRadius: 6,
                    color: '#0A1F44',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '7px 14px',
                    cursor: (dispatchingId || !editText.trim()) ? 'default' : 'pointer',
                    opacity: (dispatchingId || !editText.trim()) ? 0.6 : 1,
                  }}
                >
                  {isDispatching ? 'Sending…' : 'Send to VM'}
                </button>
                <button
                  onClick={() => setEditingPrompt(null)}
                  style={{ ...ghostBtn, border: '1px solid rgba(247,245,240,0.2)', fontSize: 12 }}
                >
                  Cancel edit
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FieldOpusPanel
// ---------------------------------------------------------------------------
export default function FieldOpusPanel({ profile }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [micListening, setMicListening] = useState(false);
  const [micAvailable, setMicAvailable] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [dispatchingId, setDispatchingId] = useState(null);
  const [editingPrompt, setEditingPrompt] = useState(null);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const micHandlersRef = useRef([]);
  const realtimeRef = useRef(null);
  const dispatchTimeoutRef = useRef(null);

  const isMobile = isMob();

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  const loadThread = async () => {
    const result = await sbLoadFieldOpusThread();
    if (result.ok) setMessages(result.data || []);
  };

  const subscribeRealtime = () => {
    const channel = sb.channel('field-opus-rt')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'field_opus_messages',
        filter: `thread_id=eq.${FIELD_OPUS_THREAD_ID}`,
      }, (payload) => {
        if (payload.new.role === 'dispatch_result') {
          if (dispatchTimeoutRef.current) clearTimeout(dispatchTimeoutRef.current);
          setDispatchingId(null);
        }
        setMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          const filtered = payload.new.role === 'user'
            ? prev.filter(m => !String(m.id).startsWith('opt-'))
            : prev;
          return [...filtered, payload.new];
        });
      })
      .subscribe();
    realtimeRef.current = channel;
  };

  const getAuthHeader = async () => {
    const { data: { session } } = await sb.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}` };
  };

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!open || profile?.id !== FIELD_OPUS_USER_ID) return;
    loadThread();
    subscribeRealtime();
    return () => {
      if (realtimeRef.current) sb.removeChannel(realtimeRef.current);
    };
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    SpeechRecognition.available().then(res => {
      setMicAvailable(!!res?.available);
    }).catch(() => setMicAvailable(false));
  }, []);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('field-opus:open', handler);
    return () => {
      window.removeEventListener('field-opus:open', handler);
      if (dispatchTimeoutRef.current) clearTimeout(dispatchTimeoutRef.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);

    const optId = `opt-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: optId, role: 'user', content: text, meta: {}, created_at: new Date().toISOString(),
    }]);

    try {
      const headers = await getAuthHeader();
      const res = await fetch(FIELD_OPUS_CHAT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ message: text, thread_id: FIELD_OPUS_THREAD_ID }),
      });
      const json = await res.json();
      if (!json.ok) {
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`, role: 'system',
          content: `Error: ${json.error || 'unknown'}`, meta: {}, created_at: new Date().toISOString(),
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`, role: 'system',
        content: `Network error: ${err.message || String(err)}`, meta: {}, created_at: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const dispatch = async (messageId, prompt) => {
    setDispatchingId(messageId);
    // 30-min timeout safeguard — clears button if VM never calls back
    if (dispatchTimeoutRef.current) clearTimeout(dispatchTimeoutRef.current);
    dispatchTimeoutRef.current = setTimeout(() => {
      setDispatchingId(null);
      setMessages(prev => [...prev, {
        id: `to-${Date.now()}`, role: 'system',
        content: 'Dispatch timeout: no result after 30 minutes. Check VM logs.',
        meta: {}, created_at: new Date().toISOString(),
      }]);
    }, 30 * 60 * 1000);

    try {
      const headers = await getAuthHeader();
      const res = await fetch(FIELD_OPUS_DISPATCH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ prompt, message_id: messageId }),
      });
      const json = await res.json();
      if (!json.ok) {
        // Enqueue failed — clear immediately, no point waiting for realtime
        if (dispatchTimeoutRef.current) clearTimeout(dispatchTimeoutRef.current);
        setDispatchingId(null);
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`, role: 'system',
          content: `Dispatch: ${json.error || 'unknown error'}`, meta: {}, created_at: new Date().toISOString(),
        }]);
      }
      // Enqueue succeeded: leave dispatchingId set.
      // Realtime dispatch_result handler clears it when VM result arrives.
    } catch (err) {
      if (dispatchTimeoutRef.current) clearTimeout(dispatchTimeoutRef.current);
      setDispatchingId(null);
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`, role: 'system',
        content: `Dispatch error: ${err.message || String(err)}`, meta: {}, created_at: new Date().toISOString(),
      }]);
    }
    // No finally — clearing handled per-case above (or by realtime on success).
  };

  const resetThread = async () => {
    if (!resetConfirm) { setResetConfirm(true); return; }
    setResetConfirm(false);
    const result = await sbResetFieldOpusThread();
    if (result.ok) setMessages([]);
  };

  // -------------------------------------------------------------------------
  // STT
  // -------------------------------------------------------------------------
  const stopMic = async () => {
    setMicListening(false);
    for (const h of micHandlersRef.current) { try { h.remove(); } catch {} }
    micHandlersRef.current = [];
    try { await SpeechRecognition.stop(); } catch {}
  };

  const startMic = async () => {
    if (micListening) { stopMic(); return; }
    try { await SpeechRecognition.stop(); } catch {}
    let perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== 'granted') {
      perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== 'granted') return;
    }
    const partialHandle = await SpeechRecognition.addListener('partialResults', (evt) => {
      const partial = evt.matches?.[0] || '';
      setInput(partial);
    });
    const errHandle = await SpeechRecognition.addListener('error', () => { setMicListening(false); });
    micHandlersRef.current = [partialHandle, errHandle];
    setMicListening(true);
    SpeechRecognition.start({ language: 'en-US', partialResults: true }).catch(() => setMicListening(false));
  };

  // -------------------------------------------------------------------------
  // Styles
  // -------------------------------------------------------------------------
  const panelStyle = isMobile
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: '#0A1F44',
        display: 'flex',
        flexDirection: 'column',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 0.2s ease',
      }
    : {
        position: 'fixed',
        top: 0,
        right: 0,
        width: 420,
        height: '100vh',
        zIndex: 10000,
        background: '#0A1F44',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(10,31,68,0.6)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.22s ease',
      };

  const sendEnabled = input.trim() && !loading;

  // Auth guard — after all hooks
  if (profile?.id !== FIELD_OPUS_USER_ID) return null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <>
      <style>{`
        @keyframes founceBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
      `}</style>

      {/* Panel */}
      <div style={panelStyle}>
        {/* Header */}
        <div style={{
          flexShrink: 0,
          paddingTop: 'calc(env(safe-area-inset-top) + 14px)',
          paddingBottom: '14px',
          paddingLeft: '16px',
          paddingRight: '16px',
          borderBottom: '1px solid rgba(201,168,76,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          <span style={{ color: '#C9A84C', fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', flex: 1 }}>
            FIELD·OPUS
          </span>
          <button
            onClick={resetThread}
            style={{
              ...ghostBtn,
              color: resetConfirm ? '#f87171' : 'rgba(247,245,240,0.65)',
            }}
          >
            {resetConfirm ? 'Confirm reset?' : 'Reset'}
          </button>
          {resetConfirm && (
            <button onClick={() => setResetConfirm(false)} style={ghostBtn}>
              Cancel
            </button>
          )}
          <button
            onClick={() => { setOpen(false); setResetConfirm(false); }}
            style={ghostBtn}
          >
            ✕
          </button>
        </div>

        {/* Messages list */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {messages.length === 0 && !loading && (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(247,245,240,0.35)',
              fontSize: 13,
              textAlign: 'center',
              padding: '0 20px',
            }}>
              Describe a bug or change — Opus will audit and draft a Sonnet prompt.
            </div>
          )}
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              dispatchingId={dispatchingId}
              onDispatch={dispatch}
              editingPrompt={editingPrompt}
              setEditingPrompt={setEditingPrompt}
            />
          ))}
          {loading && (
            <div style={{ display: 'flex', gap: 5, padding: '8px 12px', alignSelf: 'flex-start' }}>
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#C9A84C',
                    display: 'inline-block',
                    animation: `founceBounce 1s ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div style={{
          flexShrink: 0,
          padding: '10px 14px',
          borderTop: '1px solid rgba(201,168,76,0.15)',
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              placeholder="Describe a bug or change..."
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(201,168,76,0.25)',
                borderRadius: 8,
                color: '#F7F5F0',
                fontSize: 16,
                padding: '8px 10px',
                resize: 'none',
                minHeight: 36,
                maxHeight: 120,
                fontFamily: 'inherit',
                outline: 'none',
                lineHeight: 1.4,
              }}
            />
            {micAvailable && (
              <button
                onMouseDown={startMic}
                onMouseUp={micListening ? stopMic : undefined}
                onTouchStart={e => { e.preventDefault(); startMic(); }}
                onTouchEnd={e => { e.preventDefault(); if (micListening) stopMic(); }}
                onTouchCancel={e => { e.preventDefault(); if (micListening) stopMic(); }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: 'none',
                  background: micListening ? 'rgba(239,68,68,0.85)' : 'rgba(201,168,76,0.2)',
                  color: micListening ? '#fff' : '#C9A84C',
                  fontSize: 16,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {micListening ? '◼' : '🎤'}
              </button>
            )}
            <button
              onClick={send}
              disabled={!sendEnabled}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: 'none',
                background: sendEnabled ? '#C9A84C' : 'rgba(201,168,76,0.2)',
                color: sendEnabled ? '#0A1F44' : 'rgba(201,168,76,0.4)',
                fontSize: 18,
                fontWeight: 700,
                cursor: sendEnabled ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
