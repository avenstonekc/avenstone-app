import { useState, useEffect, useRef } from 'react';
import { ANON_KEY, PROCESS_TRANSCRIPT_URL } from '../../../lib/supabase';
import { isMob } from '../../../lib/utils';

const NAV = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';
const BORDER = '#E8E4DC';

export default function MeasurePanel({
  jobId,
  sessionId,
  getSessionId,
  profile,
  transcriptContext,
  onSessionCreate,
  onMeasurementsUpdate,
  onDone,
}) {
  const mob = isMob();
  const [currentTrade, setCurrentTrade] = useState('');
  const [tradeMessages, setTradeMessages] = useState([]);
  const [repInput, setRepInput] = useState('');
  const [measureListening, setMeasureListening] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [measurements, setMeasurements] = useState([]);
  const [initialized, setInitialized] = useState(false);

  const measureRecogRef = useRef(null);
  const chatBottomRef = useRef(null);
  const voicesRef = useRef([]);

  // Load TTS voices
  useEffect(() => {
    const load = () => { voicesRef.current = window.speechSynthesis?.getVoices() || []; };
    load();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = load;
  }, []);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tradeMessages]);

  // Unmount: stop measure mic
  useEffect(() => {
    return () => {
      stopMeasureMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize measure session on mount
  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      initMeasure();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speakMeasure = (text) => {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*_`#>\-]/g, '').replace(/\n+/g, '. ').trim();
    const utt = new SpeechSynthesisUtterance(clean);
    const voices = voicesRef.current;
    utt.voice = voices.find(v => v.name === 'Samantha') ||
                voices.find(v => v.name === 'Karen') ||
                voices.find(v => v.name.includes('Google') && v.lang === 'en-US') ||
                voices.find(v => v.lang.startsWith('en-US')) ||
                voices[0] || null;
    utt.rate = 1.0; utt.pitch = 1; utt.volume = 1;
    window.speechSynthesis.speak(utt);
  };

  const startMeasureMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    window.speechSynthesis?.cancel();
    const recog = new SR();
    recog.continuous = false;
    recog.interimResults = false;
    recog.lang = 'en-US';
    recog.onstart = () => setMeasureListening(true);
    recog.onresult = e => {
      const text = e.results[0]?.[0]?.transcript || '';
      if (text) setRepInput(text);
    };
    recog.onend = () => { setMeasureListening(false); measureRecogRef.current = null; };
    recog.onerror = () => { setMeasureListening(false); measureRecogRef.current = null; };
    measureRecogRef.current = recog;
    recog.start();
  };

  const stopMeasureMic = () => {
    measureRecogRef.current?.stop();
    measureRecogRef.current = null;
    setMeasureListening(false);
  };

  const getHeaders = () => ({
    Authorization: `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
  });

  const initMeasure = async () => {
    try {
      const sid = getSessionId() || await onSessionCreate();

      const openingContext = [
        `Job ID: ${jobId}`,
        transcriptContext ? `Context from ambient session: ${transcriptContext.slice(0, 500)}` : '',
      ].filter(Boolean).join('\n');

      const res = await fetch(PROCESS_TRANSCRIPT_URL, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          session_id: sid,
          job_id: jobId,
          transcript_chunk: openingContext,
          mode: 'measure',
          trade: null,
          is_opening: true,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();

      const firstMsg = json.next_question || "What trades are we looking at today? (e.g. roofing, HVAC, electrical, plumbing…)";
      setTradeMessages([{ role: 'ai', text: firstMsg }]);
      speakMeasure(firstMsg);
    } catch (e) {
      setTradeMessages([{ role: 'ai', text: "What trades are we looking at today? (e.g. roofing, HVAC, electrical, plumbing…)" }]);
    }
  };

  const sendMeasureMessage = async () => {
    const text = repInput.trim();
    if (!text || sendingMsg) return;

    setRepInput('');
    setSendingMsg(true);

    const updated = [...tradeMessages, { role: 'rep', text }];
    setTradeMessages(updated);

    try {
      const sid = getSessionId() || await onSessionCreate();
      const res = await fetch(PROCESS_TRANSCRIPT_URL, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          session_id: sid,
          job_id: jobId,
          transcript_chunk: text,
          mode: 'measure',
          trade: currentTrade || null,
          conversation_history: updated,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();

      if (json.trade_complete && json.fields) {
        const completedTrade = currentTrade || json.trade || 'Unknown';
        const newMs = [...measurements, { trade: completedTrade, fields: json.fields, completed: true }];
        setMeasurements(newMs);
        onMeasurementsUpdate(newMs);
      }

      if (json.current_trade) setCurrentTrade(json.current_trade);

      const aiReply = json.next_question;
      if (aiReply) {
        setTradeMessages(prev => [...prev, { role: 'ai', text: aiReply }]);
        speakMeasure(aiReply);
      }

      if (json.all_trades_complete) {
        const doneMsg = "Great — I have all the measurements I need. Ready to generate the estimate whenever you are.";
        setTradeMessages(prev => [...prev, { role: 'ai', text: doneMsg }]);
        speakMeasure(doneMsg);
      }
    } catch (e) {
      setTradeMessages(prev => [...prev, { role: 'ai', text: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setSendingMsg(false);
    }
  };

  const completedTrades = measurements.filter(m => m.completed).map(m => m.trade);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Trade progress */}
      {completedTrades.length > 0 && (
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, fontWeight: 700 }}>
            Trades Progress
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {completedTrades.map(t => (
              <span key={t} style={{ padding: '3px 12px', background: '#D1FAE5', color: '#065F46', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
                ✓ {t}
              </span>
            ))}
            {currentTrade && !completedTrades.includes(currentTrade) && (
              <span style={{ padding: '3px 12px', background: '#DBEAFE', color: '#1E40AF', borderRadius: 20, fontSize: 13, fontWeight: 600, border: '1px solid #93C5FD' }}>
                → {currentTrade}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Chat thread */}
      <div style={{
        background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10,
        padding: mob ? 10 : 16,
        minHeight: mob ? 160 : 280, maxHeight: mob ? 220 : 360,
        overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {tradeMessages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'rep' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '78%', padding: '10px 14px',
              borderRadius: msg.role === 'rep' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: msg.role === 'rep' ? NAV : CREAM,
              color: msg.role === 'rep' ? '#fff' : NAV,
              fontFamily: 'DM Sans, sans-serif', fontSize: 14, lineHeight: 1.5,
              boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        {sendingMsg && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '10px 14px', borderRadius: '18px 18px 18px 4px', background: CREAM, color: '#9CA3AF', fontSize: 14 }}>
              Thinking…
            </div>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="finp"
          style={{ flex: 1 }}
          placeholder={measureListening ? 'Listening…' : 'Type or tap mic to answer…'}
          value={repInput}
          onChange={e => setRepInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMeasureMessage();
            }
          }}
          disabled={sendingMsg}
        />
        <button
          onClick={measureListening ? stopMeasureMic : startMeasureMic}
          disabled={sendingMsg}
          style={{
            width: 44, height: 44, flexShrink: 0,
            border: `1px solid ${measureListening ? '#EF4444' : BORDER}`,
            background: measureListening ? '#FEE2E2' : '#fff',
            color: measureListening ? '#EF4444' : '#6B7280',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 6, fontSize: 18,
          }}
          title={measureListening ? 'Stop recording' : 'Speak your answer'}
        >
          🎙
        </button>
        <button
          className="btn btn-navy"
          onClick={sendMeasureMessage}
          disabled={sendingMsg || !repInput.trim()}
          style={{ minWidth: 72 }}
        >
          Send
        </button>
      </div>

      <button className="btn btn-gold" style={{ width: '100%' }} onClick={onDone}>
        Done Measuring — Generate Estimate
      </button>
    </div>
  );
}
