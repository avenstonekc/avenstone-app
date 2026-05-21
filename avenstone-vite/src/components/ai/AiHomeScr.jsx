import { useState, useEffect, useRef } from 'react';
import { sb, ANON_KEY, AI_HOME_URL } from '../../lib/supabase';
import { isMob } from '../../lib/utils';

const IcSparkle = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '100%', height: '100%' }}>
    <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z"/>
    <path d="M5 3l.67 2L8 5.67 5.67 6.33 5 8.33l-.67-2L2 5.67 4.33 5 5 3z" opacity="0.6"/>
    <path d="M19 15l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5z" opacity="0.6"/>
  </svg>
);

const TypingDots = () => (
  <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '10px 14px' }}>
    {[0, 1, 2].map(i => (
      <div key={i} style={{
        width: 7, height: 7, borderRadius: '50%', background: '#C9A84C',
        animation: 'bounce 1.2s infinite',
        animationDelay: `${i * 0.2}s`
      }} />
    ))}
  </div>
);

export default function AiHomeScr({ profile, jobs, nav, onOpenJob }) {
  const mob = isMob();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (profile?.full_name || '').split(' ')[0] || 'there';

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (text, history) => {
    const userMsg = { role: 'user', content: text };
    const newHistory = [...history, userMsg];

    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await fetch(AI_HOME_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`
        },
        body: JSON.stringify({
          user_id: profile?.id,
          role: profile?.role,
          tenant_id: profile?.tenant_id,
          message: text,
          conversation_history: history
        })
      });

      const data = await res.json();
      const aiContent = data.response || data.message || data.content || (data.error ? `Error: ${data.error}` : 'I encountered an issue. Please try again.');
      const jobRefs = data.job_references || [];

      const aiMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: aiContent,
        job_references: jobRefs
      };

      setMessages(prev => [...prev, aiMsg]);
      setConversationHistory([...newHistory, { role: 'assistant', content: aiContent }]);
      loadTasks();
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: 'Something went wrong reaching the AI. Please try again.',
        job_references: []
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    sendMessage(text, conversationHistory);
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = e => {
      const transcript = e.results[0][0].transcript;
      setInput(prev => prev ? prev + ' ' + transcript : transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
  };

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#F7F5F0',
      fontFamily: "'DM Sans', sans-serif"
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: mob ? '14px 16px' : '16px 24px',
        background: '#fff',
        borderBottom: '1px solid #E8E4DC',
        flexShrink: 0
      }}>
        <div style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 22,
          color: '#0A1F44',
          lineHeight: 1.2
        }}>
          {greeting}, {firstName}
        </div>
        <button
          onClick={() => nav('stats')}
          className="btn btn-ghost"
          style={{ fontSize: 13, color: '#0A1F44', border: '1px solid #E8E4DC', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', background: 'transparent', fontFamily: "'DM Sans', sans-serif" }}
        >
          Stats →
        </button>
      </div>


      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        {isEmpty && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            paddingTop: 40,
            paddingBottom: 40,
          }}>
            <div style={{ width: 36, height: 36, color: '#C9A84C', opacity: 0.5 }}>
              <IcSparkle />
            </div>
            <div style={{ fontSize: 14, color: '#9CA3AF', textAlign: 'center' }}>
              Ask me anything about your projects
            </div>
            <button onClick={() => nav('today')} style={{
              marginTop: 8,
              background: 'transparent', border: '1px solid #E8E4DC',
              padding: '10px 16px', fontSize: 13, color: '#0A1F44',
              cursor: 'pointer', fontWeight: 600, borderRadius: 8,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              View your to-dos →
            </button>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
          }}>
            <div style={{
              maxWidth: mob ? '85%' : '70%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: msg.role === 'user' ? '#0A1F44' : '#fff',
              color: msg.role === 'user' ? '#fff' : '#1F2937',
              fontSize: 14,
              lineHeight: 1.55,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {msg.content}
            </div>

            {msg.role === 'assistant' && msg.job_references && msg.job_references.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, maxWidth: mob ? '85%' : '70%' }}>
                {msg.job_references.map(ref => (
                  <button
                    key={ref.job_id}
                    onClick={() => onOpenJob && onOpenJob(ref.job_id)}
                    style={{
                      background: '#fff',
                      border: '1.5px solid #C9A84C',
                      borderRadius: 20,
                      padding: '4px 12px',
                      fontSize: 12,
                      color: '#0A1F44',
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 500,
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#FEF9EC'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                  >
                    → {ref.address || ref.job_id}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div style={{
              background: '#fff',
              borderRadius: '18px 18px 18px 4px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
            }}>
              <TypingDots />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{
        borderTop: '1px solid #E8E4DC',
        background: '#fff',
        padding: mob ? '10px 12px' : '12px 16px',
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
        flexShrink: 0
      }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a follow-up…"
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            border: '1px solid #E8E4DC',
            borderRadius: 20,
            padding: '10px 14px',
            fontSize: 14,
            fontFamily: "'DM Sans', sans-serif",
            outline: 'none',
            background: '#F7F5F0',
            color: '#1F2937',
            lineHeight: 1.4,
            maxHeight: 120,
            overflowY: 'auto',
            transition: 'border-color 0.15s'
          }}
          onFocus={e => { e.target.style.borderColor = '#C9A84C'; }}
          onBlur={e => { e.target.style.borderColor = '#E8E4DC'; }}
          onInput={e => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
        />

        {/* Mic button */}
        <button
          onClick={toggleMic}
          title={listening ? 'Stop listening' : 'Voice input'}
          style={{
            width: 40, height: 40,
            borderRadius: '50%',
            border: `1.5px solid ${listening ? '#C9A84C' : '#E8E4DC'}`,
            background: listening ? '#FEF9EC' : 'transparent',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: listening ? '#C9A84C' : '#9CA3AF',
            flexShrink: 0,
            transition: 'all 0.15s'
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 18, height: 18 }}>
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        </button>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          style={{
            width: 40, height: 40,
            borderRadius: '50%',
            border: 'none',
            background: input.trim() && !loading ? '#0A1F44' : '#E8E4DC',
            cursor: input.trim() && !loading ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: input.trim() && !loading ? '#fff' : '#9CA3AF',
            flexShrink: 0,
            transition: 'all 0.15s'
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 18, height: 18 }}>
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
