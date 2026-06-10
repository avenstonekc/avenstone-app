import { useState, useEffect, useRef, useCallback } from 'react';
import { AI_FIELD_AGENT_URL, ANON_KEY, AV_TENANT } from '../../lib/supabase';
import { isMob } from '../../lib/utils';

const NAV   = 'var(--navy-900)';
const GREEN = 'var(--green-dot)';
const GOLD  = 'var(--gold-500)';

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcLightning = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '100%', height: '100%' }}>
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
  </svg>
);
const IcMic = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '100%', height: '100%' }}>
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
    <path d="M19 10v2a7 7 0 01-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);
const IcCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ width: '100%', height: '100%' }}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IcX = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '100%', height: '100%' }}>
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// ── Orb ───────────────────────────────────────────────────────────────────────
function Orb({ state, interim }) {
  const cfg = {
    idle:        { color: '#334155', glow: 'rgba(51,65,85,0.3)',    label: 'Tap to speak' }, // slate-700, no token
    listening:   { color: 'var(--red-text)', glow: 'rgba(239,68,68,0.3)',   label: interim || 'Listening…' },
    thinking:    { color: GOLD,      glow: 'rgba(201,168,76,0.3)',   label: 'Thinking…' },
    speaking:    { color: 'var(--blue-link)', glow: 'rgba(59,130,246,0.3)',  label: 'Speaking…' },
    confirming:  { color: GREEN,     glow: 'rgba(34,197,94,0.3)',   label: 'Confirm?' },
  }[state] || { color: '#334155', glow: 'transparent', label: '' };

  const pulse = state !== 'idle';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: 110, height: 110 }}>
        {pulse && (
          <div style={{ position: 'absolute', inset: -18, borderRadius: '50%', background: cfg.glow, animation: 'faPulse 1.4s ease-in-out infinite' }} />
        )}
        <div style={{
          width: 110, height: 110, borderRadius: '50%', cursor: 'pointer',
          background: `radial-gradient(circle at 35% 35%, ${cfg.color}ee, ${cfg.color}77)`,
          boxShadow: `0 0 40px ${cfg.glow}, 0 8px 32px rgba(0,0,0,0.4)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', transition: 'background 0.3s, box-shadow 0.3s',
        }}>
          <div style={{ width: 40, height: 40 }}>
            {state === 'confirming' ? <IcCheck /> : state === 'speaking' ? <IcLightning /> : <IcMic />}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 500, textAlign: 'center', minHeight: 18, maxWidth: 240, lineHeight: 1.5 }}>
        {cfg.label}
      </div>
    </div>
  );
}

// ── Confirmation card ─────────────────────────────────────────────────────────
function ConfirmCard({ action, onYes, onNo, speaking }) {
  return (
    <div style={{
      margin: '0 16px',
      background: 'rgba(34,197,94,0.1)',
      border: '1px solid rgba(34,197,94,0.3)',
      borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        Confirm Action
      </div>
      <div style={{ fontSize: 14, color: '#fff', lineHeight: 1.5, marginBottom: 14 }}>
        {action.description}
      </div>
      {!speaking && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onYes} style={{
            flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: GREEN, color: '#fff', fontWeight: 700, fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <span style={{ width: 16, height: 16 }}><IcCheck /></span> Yes, do it
          </button>
          <button onClick={onNo} style={{
            flex: 1, padding: '10px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer',
            background: 'transparent', color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <span style={{ width: 14, height: 14 }}><IcX /></span> Cancel
          </button>
        </div>
      )}
      {speaking && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
          Say "yes" or "no"…
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AiFieldAgent({ profile, currentJob }) {
  const mob = isMob();

  // Conversation
  const [messages, setMessages]   = useState([]);
  const [history, setHistory]     = useState([]); // for API
  const [actionLog, setActionLog] = useState([]); // confirmed actions this session

  // Voice
  const [voiceState, setVoiceState]     = useState('idle'); // idle|listening|thinking|speaking|confirming
  const [interim, setInterim]           = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [started, setStarted]           = useState(false);

  const recognitionRef = useRef(null);
  const voiceActiveRef = useRef(false);
  const synthRef       = useRef(null);
  const voicesRef      = useRef([]);

  // Load voices
  useEffect(() => {
    const load = () => { voicesRef.current = window.speechSynthesis?.getVoices() || []; };
    load();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = load;
  }, []);

  // ── TTS ───────────────────────────────────────────────────────────────────
  const speak = useCallback((text, onDone) => {
    if (!window.speechSynthesis) { onDone?.(); return; }
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*_`#>\-]/g, '').replace(/\n+/g, '. ').trim();
    const utt = new SpeechSynthesisUtterance(clean);
    const voices = voicesRef.current;
    utt.voice = voices.find(v => v.name === 'Samantha') ||
                voices.find(v => v.name === 'Karen') ||
                voices.find(v => v.name.includes('Google') && v.lang === 'en-US') ||
                voices.find(v => v.lang.startsWith('en-US')) ||
                voices[0] || null;
    utt.rate = 1.05; utt.pitch = 1; utt.volume = 1;
    utt.onend  = () => onDone?.();
    utt.onerror = () => onDone?.();
    window.speechSynthesis.speak(utt);
  }, []);

  const stopSpeaking = () => window.speechSynthesis?.cancel();

  // ── STT ───────────────────────────────────────────────────────────────────
  const startListening = useCallback((opts = {}) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    stopSpeaking();

    const recog = new SR();
    recog.continuous     = false;
    recog.interimResults = true;
    recog.lang           = 'en-US';

    recog.onstart = () => setVoiceState('listening');

    recog.onresult = e => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setInterim(interim || final);
      if (final) {
        setInterim('');
        recognitionRef.current = null;
        if (opts.confirmMode) handleConfirmVoice(final);
        else sendMessage(final);
      }
    };

    recog.onend = () => {
      if (voiceActiveRef.current && voiceState === 'listening') {
        setTimeout(() => { if (voiceActiveRef.current) startListening(opts); }, 500);
      }
    };

    recog.onerror = e => {
      setInterim('');
      if (e.error === 'not-allowed') {
        setStarted(false);
        voiceActiveRef.current = false;
      } else {
        setTimeout(() => { if (voiceActiveRef.current) startListening(opts); }, 800);
      }
    };

    recognitionRef.current = recog;
    recog.start();
  }, [voiceState]);

  const stopListening = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  };

  // ── Handle voice yes/no during confirmation ───────────────────────────────
  const handleConfirmVoice = (text) => {
    const t = text.toLowerCase().trim();
    const yes = ['yes','yeah','yep','confirm','do it','correct','right','sure','okay','ok','affirmative'].some(w => t.includes(w));
    const no  = ['no','nope','cancel','stop','abort','negative','wrong','never mind'].some(w => t.includes(w));
    if (yes) confirmAction();
    else if (no) cancelAction();
    else {
      // Ambiguous — ask again
      speak("I didn't catch that. Say yes to confirm or no to cancel.", () => {
        if (voiceActiveRef.current) startListening({ confirmMode: true });
      });
    }
  };

  // ── Send message to edge function ─────────────────────────────────────────
  const sendMessage = async (text) => {
    if (!text?.trim()) return;
    setVoiceState('thinking');
    setMessages(p => [...p, { role: 'user', text }]);
    const newHistory = [...history, { role: 'user', content: text }];

    try {
      const res = await fetch(AI_FIELD_AGENT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id:    profile.id,
          role:       profile.role,
          tenant_id:  AV_TENANT,
          message:    text,
          job_id:     currentJob?.id || null,
          conversation_history: history.slice(-8),
        }),
      });
      const json = await res.json();
      const reply = json.reply || "Got it.";
      const pending = json.pending_action || null;

      setMessages(p => [...p, { role: 'ai', text: reply }]);
      setHistory([...newHistory, { role: 'assistant', content: reply }]);

      if (pending) {
        setPendingAction(pending);
        setVoiceState('confirming');
        speak(reply, () => {
          setVoiceState('confirming');
          if (voiceActiveRef.current) startListening({ confirmMode: true });
        });
      } else {
        setVoiceState('speaking');
        speak(reply, () => {
          setVoiceState('idle');
          if (voiceActiveRef.current) startListening();
        });
      }
    } catch (e) {
      const err = 'Something went wrong. Try again.';
      setMessages(p => [...p, { role: 'ai', text: err }]);
      setVoiceState('speaking');
      speak(err, () => { setVoiceState('idle'); if (voiceActiveRef.current) startListening(); });
    }
  };

  // ── Confirm / cancel pending action ───────────────────────────────────────
  const confirmAction = async () => {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    setVoiceState('thinking');

    try {
      const res = await fetch(AI_FIELD_AGENT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id:    profile.id,
          role:       profile.role,
          tenant_id:  AV_TENANT,
          message:    'confirmed',
          job_id:     currentJob?.id || null,
          pending_action: action,
          confirmed:  true,
        }),
      });
      const json = await res.json();
      const reply = json.reply || 'Done.';

      setMessages(p => [...p, { role: 'action', text: reply, label: json.action_label }]);
      if (json.action_label) setActionLog(p => [json.action_label, ...p].slice(0, 10));

      setVoiceState('speaking');
      speak(reply, () => {
        setVoiceState('idle');
        if (voiceActiveRef.current) startListening();
      });
    } catch {
      speak('Something went wrong executing that.', () => {
        setVoiceState('idle');
        if (voiceActiveRef.current) startListening();
      });
    }
  };

  const cancelAction = () => {
    setPendingAction(null);
    const reply = 'Cancelled.';
    setMessages(p => [...p, { role: 'ai', text: reply }]);
    setVoiceState('speaking');
    speak(reply, () => {
      setVoiceState('idle');
      if (voiceActiveRef.current) startListening();
    });
  };

  // ── Start / stop session ──────────────────────────────────────────────────
  const startSession = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch {
      alert('Microphone access required.'); return;
    }
    if (window.speechSynthesis) {
      voicesRef.current = window.speechSynthesis.getVoices();
      const u = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(u);
      window.speechSynthesis.cancel();
    }
    voiceActiveRef.current = true;
    setStarted(true);

    // Opening brief
    const greeting = currentJob
      ? `Field Agent ready. I can see ${currentJob.address}. What do you need?`
      : `Field Agent ready. What do you need?`;
    setMessages([{ role: 'ai', text: greeting }]);
    setVoiceState('speaking');
    speak(greeting, () => {
      setVoiceState('idle');
      startListening();
    });
  };

  const endSession = () => {
    stopListening();
    stopSpeaking();
    voiceActiveRef.current = false;
    setStarted(false);
    setVoiceState('idle');
    setPendingAction(null);
    setInterim('');
  };

  const handleOrbTap = () => {
    if (!started) return;
    if (voiceState === 'speaking') { stopSpeaking(); startListening(); }
    else if (voiceState === 'idle') startListening();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0f172a', overflow: 'hidden', minHeight: 0 }}>
      <style>{`
        @keyframes faPulse { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(1.3);opacity:0.15} }
        @keyframes faSlide { from{transform:translateY(8px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>

      {/* Header */}
      <div style={{ background: '#0A1F44', borderBottom: '1px solid rgba(201,168,76,0.2)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, color: GOLD }}><IcLightning /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: '#fff' }}>Field Agent</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
            {currentJob ? currentJob.address : 'Action-taking AI · Voice first'}
          </div>
        </div>
        {started && (
          <button onClick={endSession} style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
            End session
          </button>
        )}
      </div>

      {/* Action log */}
      {actionLog.length > 0 && (
        <div style={{ background: 'rgba(34,197,94,0.06)', borderBottom: '1px solid rgba(34,197,94,0.15)', padding: '8px 16px', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Done this session</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {actionLog.map((a, i) => (
              <span key={i} style={{ fontSize: 11, background: 'rgba(34,197,94,0.12)', color: GREEN, padding: '2px 10px', borderRadius: 20, fontWeight: 600 }}>
                ✓ {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Not started */}
      {!started ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 32 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: '#fff', marginBottom: 8 }}>Field Agent</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, maxWidth: 280 }}>
              Talk to it. It acts. Add leads, log notes, update status, create change orders — all by voice with confirmation.
            </div>
          </div>
          {currentJob && (
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 3 }}>Context loaded</div>
              <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{currentJob.address}</div>
            </div>
          )}
          <button
            onClick={startSession}
            style={{
              background: GOLD, color: NAV, border: 'none', borderRadius: 10,
              padding: '14px 40px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
            <span style={{ width: 20, height: 20 }}><IcMic /></span>
            Start Session
          </button>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center', maxWidth: 260 }}>
            Try: "Add Sarah Johnson as a lead, she wants a kitchen remodel"
          </div>
        </div>
      ) : (
        <>
          {/* Message feed */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ animation: 'faSlide 0.2s ease', alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
                {m.role === 'action' ? (
                  <div style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, padding: '8px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: GREEN, marginBottom: 3 }}>✓ DONE</div>
                    <div style={{ fontSize: 13, color: '#fff' }}>{m.text}</div>
                    {m.label && <div style={{ fontSize: 11, color: 'rgba(34,197,94,0.7)', marginTop: 2 }}>{m.label}</div>}
                  </div>
                ) : (
                  <div style={{
                    padding: '9px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.55,
                    background: m.role === 'user' ? 'rgba(255,255,255,0.09)' : 'rgba(201,168,76,0.1)',
                    color: m.role === 'user' ? 'rgba(255,255,255,0.6)' : 'rgba(230,200,120,0.95)',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {m.text}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Confirmation card */}
          {pendingAction && (
            <ConfirmCard
              action={pendingAction}
              onYes={confirmAction}
              onNo={cancelAction}
              speaking={voiceState === 'confirming'}
            />
          )}

          {/* Orb + status */}
          <div style={{ flexShrink: 0, padding: '20px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div onClick={handleOrbTap}>
              <Orb state={voiceState} interim={interim} />
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
              {voiceState === 'idle' && 'Tap orb or just speak'}
              {voiceState === 'confirming' && 'Say "yes" or "no" — or use buttons above'}
              {voiceState === 'speaking' && 'Tap orb to interrupt'}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
