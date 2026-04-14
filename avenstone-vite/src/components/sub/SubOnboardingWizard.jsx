import { useState, useEffect, useRef } from 'react';

const AI_SUB_ONBOARD_URL = 'https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1/ai-sub-onboard';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ';

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 14px', background: '#F7F5F0', borderRadius: 12, borderBottomLeftRadius: 2, maxWidth: 72, alignSelf: 'flex-start' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#0A1F44',
            opacity: 0.4,
            animation: 'typingBounce 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, height: '100%' }}>
      <div style={{
        width: 40,
        height: 40,
        border: '3px solid #E8E4DC',
        borderTopColor: '#C9A84C',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      {label && <p style={{ color: '#F7F5F0', fontFamily: 'DM Sans, sans-serif', fontSize: 15, margin: 0 }}>{label}</p>}
    </div>
  );
}

// ── Pricing panel ─────────────────────────────────────────────────────────────
function PricingPanel({ items, isReview }) {
  if (!items || items.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24 }}>
        <p style={{ color: '#9B8E7A', fontFamily: 'DM Sans, sans-serif', fontSize: 14, textAlign: 'center', margin: 0 }}>
          Prices appear here as we collect them
        </p>
      </div>
    );
  }

  // Group by trade
  const groups = items.reduce((acc, item) => {
    const key = item.trade || 'General';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const trades = Object.keys(groups);

  return (
    <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
      {isReview && (
        <h3 style={{ fontFamily: 'DM Serif Display, serif', color: '#0A1F44', fontSize: 18, margin: '0 0 16px 0' }}>
          Review Your Pricing
        </h3>
      )}
      {trades.map(trade => (
        <div key={trade} style={{ marginBottom: 20 }}>
          {trades.length > 1 && (
            <p style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 12, color: '#9B8E7A', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px 0' }}>
              {trade}
            </p>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Item</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Unit</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
              </tr>
            </thead>
            <tbody>
              {groups[trade].map((item, idx) => (
                <tr key={item.key || idx} style={{ borderBottom: '1px solid #E8E4DC' }}>
                  <td style={tdStyle}>
                    {item.label}
                    {item.is_custom && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: '#C9A84C', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        custom
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: '#9B8E7A' }}>{item.unit || '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#0A1F44' }}>
                    {item.price != null ? `$${Number(item.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

const thStyle = {
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 11,
  fontWeight: 600,
  color: '#9B8E7A',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  padding: '4px 6px 8px',
  textAlign: 'left',
  borderBottom: '2px solid #E8E4DC',
};

const tdStyle = {
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 14,
  color: '#0A1F44',
  padding: '10px 6px',
};

// ── Main component ────────────────────────────────────────────────────────────
export default function SubOnboardingWizard({ profile, onComplete }) {
  const [phase, setPhase] = useState('loading'); // loading | chat | review | saving | done | error
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [collectedItems, setCollectedItems] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const hasMounted = useRef(false);

  // Responsive
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiTyping]);

  // Initial greeting
  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;
    callApi({ conversationHistory: [] });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function callApi({ userMessage, conversationHistory }) {
    setIsAiTyping(true);
    setErrorMsg(null);

    const body = {
      sub_id: profile.id,
      tenant_id: profile.tenant_id,
      trade: profile.trade,
      full_name: profile.full_name,
    };

    if (userMessage !== undefined) {
      body.message = userMessage;
    }

    if (conversationHistory !== undefined) {
      body.conversation_history = conversationHistory;
    }

    try {
      const res = await fetch(AI_SUB_ONBOARD_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      const data = await res.json();

      const aiMsg = { role: 'assistant', content: data.message };

      setMessages(prev => [...prev, { type: 'ai', text: data.message }]);
      setHistory(prev => [...prev, aiMsg]);

      if (data.collected_items) {
        setCollectedItems(data.collected_items);
      }

      if (data.is_complete) {
        setPhase('review');
      } else if (phase === 'loading') {
        setPhase('chat');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
      if (phase === 'loading') setPhase('error');
    } finally {
      setIsAiTyping(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function sendMessage() {
    const text = inputText.trim();
    if (!text || isAiTyping) return;

    const userEntry = { role: 'user', content: text };
    const nextHistory = [...history, userEntry];

    setMessages(prev => [...prev, { type: 'user', text }]);
    setHistory(nextHistory);
    setInputText('');

    callApi({ userMessage: text, conversationHistory: nextHistory });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  async function savePricing() {
    setPhase('saving');
    setErrorMsg(null);

    try {
      const res = await fetch(AI_SUB_ONBOARD_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY,
        },
        body: JSON.stringify({
          sub_id: profile.id,
          tenant_id: profile.tenant_id,
          trade: profile.trade,
          full_name: profile.full_name,
          action: 'save',
          items: collectedItems,
        }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();
      if (!data.saved) throw new Error('Pricing was not saved. Please try again.');

      setPhase('done');
      setTimeout(() => onComplete(), 2000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save pricing. Please try again.');
      setPhase('review');
    }
  }

  function retryInitial() {
    setPhase('loading');
    setMessages([]);
    setHistory([]);
    setCollectedItems([]);
    setErrorMsg(null);
    callApi({ conversationHistory: [] });
  }

  // ── Render phases ────────────────────────────────────────────────────────
  const renderBody = () => {
    if (phase === 'loading') {
      return <Spinner label="Getting things ready..." />;
    }

    if (phase === 'saving') {
      return <Spinner label="Saving your pricing..." />;
    }

    if (phase === 'done') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, height: '100%' }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: '#22c55e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p style={{ fontFamily: 'DM Serif Display, serif', color: '#F7F5F0', fontSize: 22, margin: 0, textAlign: 'center' }}>
            You're all set! Let's get to work.
          </p>
        </div>
      );
    }

    // chat or review
    return (
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        flex: 1,
        overflow: 'hidden',
        gap: 0,
      }}>
        {/* Mobile pricing strip */}
        {isMobile && collectedItems.length > 0 && (
          <div style={{
            background: '#C9A84C',
            padding: '8px 16px',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 13,
            fontWeight: 600,
            color: '#0A1F44',
            flexShrink: 0,
          }}>
            {collectedItems.length} {collectedItems.length === 1 ? 'price' : 'prices'} collected
          </div>
        )}

        {/* LEFT: Chat */}
        <div style={{
          flex: isMobile ? '1' : '0 0 55%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRight: !isMobile ? '1px solid rgba(255,255,255,0.1)' : 'none',
        }}>
          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 20px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{
                  maxWidth: '78%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  borderBottomLeftRadius: msg.type === 'ai' ? 2 : 12,
                  borderBottomRightRadius: msg.type === 'user' ? 2 : 12,
                  background: msg.type === 'ai' ? '#F7F5F0' : '#0A1F44',
                  color: msg.type === 'ai' ? '#0A1F44' : '#FFFFFF',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 14,
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  border: msg.type === 'ai' ? '1px solid #E8E4DC' : 'none',
                }}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isAiTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          {phase === 'chat' && (
            <div style={{
              padding: '12px 16px',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              gap: 8,
              flexShrink: 0,
            }}>
              <input
                ref={inputRef}
                className="finp"
                type="text"
                placeholder="Type your reply…"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isAiTyping}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#F7F5F0',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
              <button
                className="btn btn-gold"
                onClick={sendMessage}
                disabled={isAiTyping || !inputText.trim()}
                style={{ flexShrink: 0, opacity: (isAiTyping || !inputText.trim()) ? 0.5 : 1 }}
              >
                Send
              </button>
            </div>
          )}

          {/* Review actions */}
          {phase === 'review' && (
            <div style={{
              padding: '16px',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              gap: 10,
              flexShrink: 0,
              flexWrap: 'wrap',
            }}>
              <button
                className="btn btn-gold"
                onClick={savePricing}
                style={{ flex: '1 1 auto' }}
              >
                Looks good — Save My Pricing
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setPhase('chat')}
                style={{ flex: '0 0 auto', color: '#F7F5F0', borderColor: 'rgba(255,255,255,0.3)' }}
              >
                Go back and edit
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: Pricing panel — desktop only */}
        {!isMobile && (
          <div style={{
            flex: '0 0 45%',
            background: '#FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '16px 20px 0',
              flexShrink: 0,
            }}>
              <h3 style={{
                fontFamily: 'DM Serif Display, serif',
                color: '#0A1F44',
                fontSize: phase === 'review' ? 20 : 16,
                margin: '0 0 4px 0',
              }}>
                {phase === 'review' ? 'Review Your Pricing' : 'Pricing Collected'}
              </h3>
              {collectedItems.length > 0 && (
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#9B8E7A', margin: '0 0 12px 0' }}>
                  {collectedItems.length} item{collectedItems.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <PricingPanel items={collectedItems} isReview={false} />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Keyframe styles */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>

      {/* Full-screen overlay */}
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: '#0A1F44',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 28px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0,
          background: '#0A1F44',
        }}>
          <p style={{
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 13,
            color: '#C9A84C',
            margin: '0 0 4px 0',
            fontWeight: 500,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            Welcome to Avenstone
          </p>
          <h1 style={{
            fontFamily: 'DM Serif Display, serif',
            fontSize: isMobile ? 22 : 26,
            color: '#F7F5F0',
            margin: 0,
          }}>
            {profile.full_name}
          </h1>
        </div>

        {/* Error banner */}
        {errorMsg && (
          <div style={{
            background: '#fee2e2',
            borderBottom: '1px solid #fca5a5',
            padding: '10px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexShrink: 0,
          }}>
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#991b1b' }}>
              {errorMsg}
            </span>
            <button
              className="btn btn-ghost"
              onClick={phase === 'error' ? retryInitial : () => setErrorMsg(null)}
              style={{ fontSize: 13, color: '#991b1b', borderColor: '#fca5a5', padding: '4px 12px' }}
            >
              {phase === 'error' ? 'Retry' : 'Dismiss'}
            </button>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {renderBody()}
        </div>
      </div>
    </>
  );
}
