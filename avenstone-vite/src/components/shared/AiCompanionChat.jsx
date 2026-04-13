import { useState, useEffect, useRef } from 'react';
import { ANON_KEY } from '../../lib/supabase';
import { isMob } from '../../lib/utils';

const COMPANION_URL = 'https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1/ai-companion';

const NAV   = '#0A1F44';
const GOLD  = '#C9A84C';
const CREAM = '#F7F5F0';
const BORDER = '#E8E4DC';

const IcSparkle = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '100%', height: '100%' }}>
    <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z"/>
    <path d="M5 3l.67 2L8 5.67 5.67 6.33 5 8.33l-.67-2L2 5.67 4.33 5 5 3z" opacity="0.6"/>
    <path d="M19 15l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5z" opacity="0.6"/>
  </svg>
);

const IcClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '100%', height: '100%' }}>
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IcSend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '100%', height: '100%' }}>
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9 22,2"/>
  </svg>
);

const IcMic = ({ active }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '100%', height: '100%', color: active ? '#EF4444' : 'inherit' }}>
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
    <path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

function TypingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 14px', background: CREAM, borderRadius: '18px 18px 18px 4px', width: 'fit-content' }}>
      {[0,1,2].map(i => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#9CA3AF', display: 'inline-block', animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
      ))}
    </div>
  );
}

export default function AiCompanionChat({ job, profile }) {
  const mob = isMob();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [companionId, setCompanionId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open && !hasOpened && job?.id) {
      setHasOpened(true);
      sendMessage('brief me on this job', true);
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  const sendMessage = async (text, isOpening = false) => {
    if (!text?.trim() || loading) return;
    const userMsg = { role: 'user', text, isOpening };
    if (!isOpening) setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(COMPANION_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          user_id: profile?.id,
          role: profile?.role || 'sales_rep',
          message: text,
          tenant_id: profile?.tenant_id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');

      if (json.companion_id) setCompanionId(json.companion_id);
      setMessages(prev => [...prev, {
        role: 'ai',
        text: json.reply || 'No response.',
        actions: json.actions_taken || [],
      }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', text: `Sorry, something went wrong: ${e.message}`, actions: [] }]);
    } finally {
      setLoading(false);
    }
  };

  const startMic = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;
      const recog = new SR();
      recog.continuous = false;
      recog.interimResults = false;
      recog.lang = 'en-US';
      recog.onresult = e => {
        const text = e.results[0]?.[0]?.transcript || '';
        if (text) setInput(p => (p + ' ' + text).trim());
      };
      recog.onend = () => setIsRecording(false);
      recog.onerror = () => setIsRecording(false);
      recog.start();
      recognitionRef.current = recog;
      setIsRecording(true);
    } catch {}
  };

  const stopMic = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
  };

  const toggleMic = () => isRecording ? stopMic() : startMic();

  const onKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  // iOS virtual keyboard fires onChange with \n instead of keydown Enter
  const onInputChange = e => {
    const val = e.target.value;
    if (mob && val.endsWith('\n')) {
      sendMessage(val.trim());
    } else {
      setInput(val);
    }
  };

  if (!job?.id) return null;

  // Panel sizing
  const panelW = mob ? '100%' : '400px';
  const panelH = mob ? '100%' : '100%';
  const panelTop = mob ? 0 : 0;
  const panelRight = 0;

  return (
    <>
      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
        @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
      `}</style>

      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            bottom: mob ? 74 : 28,
            right: 18,
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: NAV,
            border: `2px solid ${GOLD}`,
            color: GOLD,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(10,31,68,0.35)',
            zIndex: 1000,
            padding: 12,
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(10,31,68,0.45)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(10,31,68,0.35)'; }}
          title="AI Companion"
        >
          <IcSparkle />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            top: panelTop,
            right: panelRight,
            width: panelW,
            height: panelH,
            background: '#fff',
            borderLeft: mob ? 'none' : `1px solid ${BORDER}`,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1001,
            animation: mob ? 'slideUp 0.25s ease' : 'slideIn 0.22s ease',
            boxShadow: '-4px 0 24px rgba(10,31,68,0.12)',
          }}
        >
          {/* Header */}
          <div style={{ background: NAV, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, color: GOLD, flexShrink: 0 }}><IcSparkle /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: '#fff', lineHeight: 1.2 }}>AI Companion</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {job.address || 'Current Job'}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 4 }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
            >
              <IcClose />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12, background: CREAM }}>
            {messages.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF', fontSize: 13 }}>
                <div style={{ width: 40, height: 40, color: '#D1D5DB', margin: '0 auto 12px' }}><IcSparkle /></div>
                Ask me anything about this job.
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: msg.role === 'user' ? NAV : '#fff',
                  color: msg.role === 'user' ? '#fff' : NAV,
                  fontSize: 14,
                  lineHeight: 1.55,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {msg.text}
                </div>
                {msg.actions?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, maxWidth: '85%' }}>
                    {msg.actions.map((a, ai) => (
                      <span key={ai} style={{ fontSize: 11, padding: '2px 8px', background: '#D1FAE5', color: '#065F46', borderRadius: 20, fontWeight: 600 }}>
                        ✓ {a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <TypingDots />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ borderTop: `1px solid ${BORDER}`, padding: '10px 12px', background: '#fff', flexShrink: 0, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              rows={1}
              className="finp"
              style={{ flex: 1, resize: 'none', fontFamily: "'DM Sans',sans-serif", fontSize: 14, lineHeight: 1.45, padding: '9px 12px', maxHeight: 100, overflowY: 'auto' }}
              placeholder="Ask anything about this job…"
              value={input}
              onChange={onInputChange}
              onKeyDown={onKeyDown}
              enterKeyHint="send"
              disabled={loading}
            />
            <button
              onClick={toggleMic}
              style={{
                width: 38, height: 38, flexShrink: 0, border: `1px solid ${isRecording ? '#EF4444' : BORDER}`,
                background: isRecording ? '#FEE2E2' : '#fff', color: isRecording ? '#EF4444' : '#6B7280',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 8, padding: 9, transition: 'all 0.15s',
              }}
              title={isRecording ? 'Stop recording' : 'Voice input'}
            >
              <IcMic active={isRecording} />
            </button>
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              style={{
                width: 38, height: 38, flexShrink: 0, background: input.trim() && !loading ? NAV : '#E5E7EB',
                color: input.trim() && !loading ? '#fff' : '#9CA3AF', border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'default',
                borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 10, transition: 'background 0.15s',
              }}
            >
              <IcSend />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
