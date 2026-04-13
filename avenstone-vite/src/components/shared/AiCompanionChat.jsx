import { useState, useEffect, useRef, useCallback } from 'react';
import { sb, ANON_KEY, AI_COMPANION_URL, AV_USER_ID } from '../../lib/supabase';
import { isMob } from '../../lib/utils';

const NAV    = '#0A1F44';
const GOLD   = '#C9A84C';
const CREAM  = '#F7F5F0';
const BORDER = '#E8E4DC';

// ── Icons ────────────────────────────────────────────────────────────────────
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
const IcMic = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '100%', height: '100%' }}>
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
    <path d="M19 10v2a7 7 0 01-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);
const IcPhone = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '100%', height: '100%' }}>
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
  </svg>
);

function TypingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 14px', background: CREAM, borderRadius: '18px 18px 18px 4px', width: 'fit-content' }}>
      {[0,1,2].map(i => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#9CA3AF', display: 'inline-block', animation: `aiBounce 1.2s ${i * 0.2}s infinite` }} />
      ))}
    </div>
  );
}

// ── Voice orb — visual state indicator ───────────────────────────────────────
function VoiceOrb({ state, interimText }) {
  const cfg = {
    idle:      { color: '#6B7280', glow: 'rgba(107,114,128,0.2)',  label: 'Tap to speak',   pulse: false },
    listening: { color: '#EF4444', glow: 'rgba(239,68,68,0.25)',   label: interimText || 'Listening…', pulse: true },
    thinking:  { color: GOLD,      glow: 'rgba(201,168,76,0.25)',   label: 'Thinking…',     pulse: true },
    speaking:  { color: '#3B82F6', glow: 'rgba(59,130,246,0.25)',  label: 'Speaking…',     pulse: true },
  }[state] || { color: '#6B7280', glow: 'rgba(0,0,0,0.1)', label: '', pulse: false };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 20, padding: 24 }}>
      <div style={{ position: 'relative', width: 100, height: 100 }}>
        {/* Outer pulse ring */}
        {cfg.pulse && (
          <div style={{
            position: 'absolute', inset: -16,
            borderRadius: '50%',
            background: cfg.glow,
            animation: 'voicePulse 1.5s ease-in-out infinite',
          }} />
        )}
        {/* Inner orb */}
        <div style={{
          width: 100, height: 100, borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, ${cfg.color}dd, ${cfg.color}88)`,
          boxShadow: `0 0 32px ${cfg.glow}, 0 8px 24px rgba(0,0,0,0.2)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', transition: 'background 0.3s',
        }}>
          <div style={{ width: 36, height: 36 }}>
            {state === 'speaking' ? <IcSparkle /> : <IcMic />}
          </div>
        </div>
      </div>

      {/* State label / interim transcript */}
      <div style={{ fontSize: 14, color: '#374151', fontWeight: 500, textAlign: 'center', minHeight: 20, maxWidth: 260, lineHeight: 1.5 }}>
        {cfg.label}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AiCompanionChat({ job, profile }) {
  const mob = isMob();
  const [open, setOpen]             = useState(false);
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [companionId, setCompanionId] = useState(null);
  const [hasOpened, setHasOpened]   = useState(false);

  // Voice mode
  const [voiceMode, setVoiceMode]     = useState(false);
  const [voiceState, setVoiceState]   = useState('idle'); // idle | listening | thinking | speaking
  const [interimText, setInterimText] = useState('');

  const bottomRef     = useRef(null);
  const inputRef      = useRef(null);
  const recognitionRef = useRef(null);
  const voiceModeRef  = useRef(false); // stable ref for callbacks

  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Load existing conversation on first open
  useEffect(() => {
    if (!open || hasOpened || !job?.id || !profile?.id) return;
    setHasOpened(true);
    const load = async () => {
      const role = profile?.role || 'sales_rep';
      const { data: companion } = await sb
        .from('job_ai_companions')
        .select('id, conversation_history')
        .eq('job_id', job.id)
        .eq('user_id', profile.id)
        .eq('role', role)
        .maybeSingle();
      if (companion?.id) {
        setCompanionId(companion.id);
        const hist = (companion.conversation_history || []).slice(-10);
        if (hist.length > 0) {
          setMessages(hist.map(m => ({ role: m.role === 'assistant' ? 'ai' : 'user', text: m.content })));
          return;
        }
      }
      sendMessage('brief me on this job', true);
    };
    load();
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  // ── Speech synthesis ────────────────────────────────────────────────────────
  const voicesRef = useRef([]);

  // Load voices — they load async on first call
  const loadVoices = () => {
    const v = window.speechSynthesis?.getVoices() || [];
    if (v.length) { voicesRef.current = v; return; }
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        voicesRef.current = window.speechSynthesis.getVoices();
      };
    }
  };

  useEffect(() => { loadVoices(); }, []);

  const getBestVoice = () => {
    const voices = voicesRef.current.length ? voicesRef.current : (window.speechSynthesis?.getVoices() || []);
    return (
      voices.find(v => v.name === 'Samantha') ||                           // iOS
      voices.find(v => v.name === 'Karen')    ||                           // iOS AU
      voices.find(v => v.name.includes('Google') && v.lang === 'en-US') || // Chrome
      voices.find(v => v.lang.startsWith('en-US')) ||
      voices[0]
    );
  };

  const speakText = useCallback((text, onDone) => {
    if (!window.speechSynthesis) { onDone?.(); return; }
    window.speechSynthesis.cancel();
    // Strip markdown symbols for cleaner speech
    const clean = text.replace(/[*_`#>\-]/g, '').replace(/\n+/g, '. ').trim();
    const utt = new SpeechSynthesisUtterance(clean);
    utt.voice  = getBestVoice();
    utt.rate   = 1.05;
    utt.pitch  = 1.0;
    utt.volume = 1.0;
    utt.onend  = () => { setVoiceState('idle'); onDone?.(); };
    utt.onerror = () => { setVoiceState('idle'); onDone?.(); };
    setVoiceState('speaking');
    window.speechSynthesis.speak(utt);
  }, []);

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    setVoiceState('idle');
  };

  // ── Speech recognition ──────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    stopSpeaking();

    const recog = new SR();
    recog.continuous      = false;
    recog.interimResults  = true;
    recog.lang            = 'en-US';

    recog.onstart = () => setVoiceState('listening');

    recog.onresult = e => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setInterimText(interim || final);
      if (final) {
        setInterimText('');
        recognitionRef.current = null;
        sendVoiceMessage(final);
      }
    };

    recog.onend = () => {
      // If still in voice mode and nothing was said — restart
      if (voiceModeRef.current && voiceState === 'listening') {
        setTimeout(() => { if (voiceModeRef.current) startListening(); }, 400);
      }
      if (voiceState === 'listening') setVoiceState('idle');
    };

    recog.onerror = e => {
      setInterimText('');
      if (e.error === 'no-speech') {
        // Restart silently
        setTimeout(() => { if (voiceModeRef.current) startListening(); }, 600);
      } else {
        setVoiceMode(false);
        setVoiceState('idle');
      }
    };

    recognitionRef.current = recog;
    recog.start();
  }, []);

  const stopListening = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  };

  // ── Voice mode toggle ────────────────────────────────────────────────────────
  const enterVoiceMode = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert('Microphone access is required for voice mode.');
      return;
    }
    // iOS REQUIRES speechSynthesis to be triggered inside a user gesture.
    // We unlock it here (synchronously during the tap handler) so async
    // speak() calls work after the fetch response comes back.
    if (window.speechSynthesis) {
      loadVoices();
      const unlock = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(unlock);
      window.speechSynthesis.cancel();
    }
    setVoiceMode(true);
    setVoiceState('idle');
    setTimeout(() => startListening(), 300);
  };

  const exitVoiceMode = () => {
    stopListening();
    stopSpeaking();
    setVoiceMode(false);
    setVoiceState('idle');
    setInterimText('');
  };

  // ── Send message (text path) ──────────────────────────────────────────────
  const sendMessage = async (text, isOpening = false) => {
    if (!text?.trim() || loading) return;
    if (!isOpening) setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch(AI_COMPANION_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id, user_id: profile?.id,
          role: profile?.role || 'sales_rep',
          message: text, tenant_id: profile?.tenant_id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      if (json.companion_id) setCompanionId(json.companion_id);
      const reply = json.reply || 'No response.';
      setMessages(prev => [...prev, { role: 'ai', text: reply, actions: json.actions_taken || [] }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', text: `Sorry, something went wrong: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  // ── Send message (voice path) — speaks reply, then auto-listens ──────────
  const sendVoiceMessage = async (text) => {
    if (!text?.trim()) return;
    setMessages(prev => [...prev, { role: 'user', text }]);
    setVoiceState('thinking');
    try {
      const res = await fetch(AI_COMPANION_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id, user_id: profile?.id,
          role: profile?.role || 'sales_rep',
          message: text, tenant_id: profile?.tenant_id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      if (json.companion_id) setCompanionId(json.companion_id);
      const reply = json.reply || 'No response.';
      setMessages(prev => [...prev, { role: 'ai', text: reply, actions: json.actions_taken || [] }]);
      // Speak the reply, then restart listening
      speakText(reply, () => {
        if (voiceModeRef.current) startListening();
      });
    } catch (e) {
      const errMsg = `Sorry, something went wrong: ${e.message}`;
      setMessages(prev => [...prev, { role: 'ai', text: errMsg }]);
      speakText(errMsg, () => {
        if (voiceModeRef.current) startListening();
      });
    }
  };

  // Tap orb to interrupt speech or manually trigger listen
  const handleOrbTap = () => {
    if (voiceState === 'speaking') {
      stopSpeaking();
      startListening();
    } else if (voiceState === 'idle') {
      startListening();
    }
    // listening / thinking — tap does nothing (let it finish)
  };

  // ── Text input handlers ──────────────────────────────────────────────────
  const onKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };
  const onInputChange = e => {
    const val = e.target.value;
    if (mob && val.endsWith('\n')) sendMessage(val.trim());
    else setInput(val);
  };

  // Legacy tap-to-record for text mode
  const toggleMic = () => {
    if (recognitionRef.current) { stopListening(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recog = new SR();
    recog.continuous = false; recog.interimResults = false; recog.lang = 'en-US';
    recog.onresult = e => { const t = e.results[0]?.[0]?.transcript || ''; if (t) setInput(p => (p + ' ' + t).trim()); };
    recog.onend = () => setIsRecording(false);
    recog.onerror = () => setIsRecording(false);
    recog.start();
    recognitionRef.current = recog;
    setIsRecording(true);
  };
  const [isRecording, setIsRecording] = useState(false);

  if (!job?.id) return null;

  const panelW = mob ? '100%' : '400px';

  return (
    <>
      <style>{`
        @keyframes aiBounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
        @keyframes slideUp  { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes slideIn  { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes voicePulse { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(1.25);opacity:0.15} }
      `}</style>

      {/* Floating open button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: mob ? 'calc(env(safe-area-inset-bottom, 0px) + 80px)' : 28, right: 18,
            width: 52, height: 52, borderRadius: '50%',
            background: NAV, border: `2px solid ${GOLD}`, color: GOLD,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(10,31,68,0.35)', zIndex: 1000, padding: 12,
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
        <div style={{
          position: 'fixed', top: 0, right: 0, width: panelW, height: '100%',
          background: '#fff', borderLeft: mob ? 'none' : `1px solid ${BORDER}`,
          display: 'flex', flexDirection: 'column', zIndex: 1001,
          animation: mob ? 'slideUp 0.25s ease' : 'slideIn 0.22s ease',
          boxShadow: '-4px 0 24px rgba(10,31,68,0.12)',
        }}>

          {/* Header */}
          <div style={{ background: NAV, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, color: GOLD, flexShrink: 0 }}><IcSparkle /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: '#fff', lineHeight: 1.2 }}>AI Companion</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {job.address || 'Current Job'}
              </div>
            </div>

            {/* Voice mode toggle */}
            <button
              onClick={voiceMode ? exitVoiceMode : enterVoiceMode}
              title={voiceMode ? 'Exit voice mode' : 'Start voice conversation'}
              style={{
                width: 34, height: 34, borderRadius: 8, border: 'none', cursor: 'pointer',
                background: voiceMode ? '#EF4444' : 'rgba(255,255,255,0.12)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 8, flexShrink: 0, transition: 'background 0.2s',
              }}
              onMouseEnter={e => { if (!voiceMode) e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
              onMouseLeave={e => { if (!voiceMode) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
            >
              <IcPhone />
            </button>

            <button
              onClick={() => { exitVoiceMode(); setOpen(false); }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 4 }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
            >
              <IcClose />
            </button>
          </div>

          {/* ── VOICE MODE UI ── */}
          {voiceMode ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0f172a', overflow: 'hidden' }}>
              {/* Recent messages (last 2 for context) */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 10 }}>
                {messages.slice(-4).map((msg, i) => (
                  <div key={i} style={{
                    padding: '10px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.6,
                    background: msg.role === 'user' ? 'rgba(255,255,255,0.08)' : 'rgba(201,168,76,0.10)',
                    color: msg.role === 'user' ? 'rgba(255,255,255,0.55)' : 'rgba(230,200,120,0.95)',
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '90%',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {msg.text}
                  </div>
                ))}
              </div>

              {/* Orb */}
              <div
                onClick={handleOrbTap}
                style={{ cursor: voiceState === 'thinking' ? 'default' : 'pointer' }}>
                <VoiceOrb state={voiceState} interimText={interimText} />
              </div>

              {/* Status bar */}
              <div style={{ padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: { idle: '#6B7280', listening: '#EF4444', thinking: GOLD, speaking: '#3B82F6' }[voiceState],
                    animation: voiceState !== 'idle' ? 'voicePulse 1s infinite' : 'none',
                  }} />
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize' }}>
                    {voiceState === 'idle' ? 'Tap orb to speak' : voiceState}
                  </span>
                </div>
                <button
                  onClick={exitVoiceMode}
                  style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                  Exit voice
                </button>
              </div>
            </div>
          ) : (
            /* ── TEXT CHAT UI ── */
            <>
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
                      maxWidth: '85%', padding: '10px 14px',
                      borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      background: msg.role === 'user' ? NAV : '#fff',
                      color: msg.role === 'user' ? '#fff' : NAV,
                      fontSize: 14, lineHeight: 1.55,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {msg.text}
                    </div>
                    {msg.actions?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, maxWidth: '85%' }}>
                        {msg.actions.map((a, ai) => (
                          <span key={ai} style={{ fontSize: 11, padding: '2px 8px', background: '#D1FAE5', color: '#065F46', borderRadius: 20, fontWeight: 600 }}>✓ {a}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {loading && <div style={{ display: 'flex', justifyContent: 'flex-start' }}><TypingDots /></div>}
                <div ref={bottomRef} />
              </div>

              {/* Voice mode hint banner */}
              <div style={{ background: '#0f172a', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>🎙 Hands-free? Try voice mode</span>
                <button onClick={enterVoiceMode} style={{ fontSize: 11, fontWeight: 700, color: GOLD, background: 'transparent', border: `1px solid ${GOLD}44`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
                  Start
                </button>
              </div>

              {/* Input bar */}
              <div style={{ borderTop: `1px solid ${BORDER}`, padding: '10px 12px', paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))', background: '#fff', flexShrink: 0, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  ref={inputRef} rows={1} className="finp"
                  style={{ flex: 1, resize: 'none', fontFamily: "'DM Sans',sans-serif", fontSize: 14, lineHeight: 1.45, padding: '9px 12px', maxHeight: 100, overflowY: 'auto' }}
                  placeholder="Ask anything about this job…"
                  value={input} onChange={onInputChange} onKeyDown={onKeyDown}
                  enterKeyHint="send" disabled={loading}
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
                  <IcMic />
                </button>
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  style={{
                    width: 38, height: 38, flexShrink: 0,
                    background: input.trim() && !loading ? NAV : '#E5E7EB',
                    color: input.trim() && !loading ? '#fff' : '#9CA3AF',
                    border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'default',
                    borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 10, transition: 'background 0.15s',
                  }}
                >
                  <IcSend />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
