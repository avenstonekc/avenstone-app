import { useState, useEffect, useRef } from 'react';
import { AI_MASTER_URL, ANON_KEY } from '../../lib/supabase';

const EXAMPLE_PROMPTS = [
  'Show me what needs attention today',
  'Create a new job at 742 Evergreen Terrace for Homer Simpson',
  "What's the status of all active jobs?",
  'Add a note to the Summit job — client requested extra outlet in master',
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

export default function MasterAgent({ profile }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPulse, setShowPulse] = useState(true);
  const threadRef = useRef(null);
  const inputRef = useRef(null);

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
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || loading) return;

    const userMsg = { role: 'user', content: trimmed };
    const newHistory = [...conversationHistory, userMsg];

    setMessages((prev) => [...prev, { type: 'user', text: trimmed }]);
    setConversationHistory(newHistory);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(AI_MASTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: profile?.id,
          tenant_id: profile?.tenant_id,
          role: profile?.role,
          full_name: profile?.full_name,
          message: trimmed,
          conversation_history: newHistory,
        }),
      });

      const data = await res.json();
      const aiText = data.response || 'No response.';
      const aiActions = data.actions || [];

      setMessages((prev) => [
        ...prev,
        { type: 'ai', text: aiText, actions: aiActions },
      ]);
      setConversationHistory((prev) => [
        ...prev,
        { role: 'assistant', content: aiText },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { type: 'ai', text: 'Something went wrong. Please try again.', actions: [] },
      ]);
    } finally {
      setLoading(false);
    }
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
                fontSize: 20,
                color: '#C9A84C',
                lineHeight: 1.2,
              }}
            >
              Avenstone AI
            </div>
            <div
              style={{
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 12,
                color: 'rgba(247,245,240,0.45)',
                marginTop: 2,
              }}
            >
              Master Control
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
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                gap: 8,
                paddingTop: 24,
              }}
            >
              <div
                style={{
                  fontSize: 36,
                  marginBottom: 4,
                  opacity: 0.6,
                }}
              >
                ✦
              </div>
              <div
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 13,
                  color: 'rgba(247,245,240,0.4)',
                  textAlign: 'center',
                  marginBottom: 12,
                }}
              >
                What can I help you with?
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
        </div>

        {/* Example prompts — shown when no messages */}
        {!hasMessages && !loading && (
          <div
            style={{
              padding: '0 16px 12px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 7,
            }}
          >
            {EXAMPLE_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => sendMessage(prompt)}
                style={{
                  background: 'rgba(201,168,76,0.1)',
                  border: '1px solid rgba(201,168,76,0.3)',
                  borderRadius: 20,
                  padding: '6px 12px',
                  color: 'rgba(247,245,240,0.75)',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                  textAlign: 'left',
                  lineHeight: 1.4,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(201,168,76,0.2)';
                  e.currentTarget.style.color = '#F7F5F0';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(201,168,76,0.1)';
                  e.currentTarget.style.color = 'rgba(247,245,240,0.75)';
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <div
          style={{
            padding: '10px 14px 16px',
            borderTop: '1px solid rgba(201,168,76,0.15)',
            display: 'flex',
            alignItems: 'flex-end',
            gap: 10,
            flexShrink: 0,
          }}
        >
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
            disabled={loading || !input.trim()}
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: loading || !input.trim() ? 'rgba(201,168,76,0.3)' : '#C9A84C',
              border: 'none',
              cursor: loading || !input.trim() ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.15s, transform 0.1s',
              marginBottom: 2,
            }}
            onMouseEnter={(e) => {
              if (!loading && input.trim()) e.currentTarget.style.transform = 'scale(1.08)';
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
              stroke={loading || !input.trim() ? 'rgba(10,31,68,0.5)' : '#0A1F44'}
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
    </>
  );
}
