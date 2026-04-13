import { useState, useRef, useEffect, useCallback } from 'react';
import { sb, AV_TENANT, MEASURE_GUIDE_URL, ANON_KEY, sbUploadDoc, sbLoadDocs } from '../../lib/supabase';
import { isMob } from '../../lib/utils';

const NAVY = '#0A1F44';
const GOLD = '#C9A84C';

// ── Orb states ──────────────────────────────────────────────────────────────
function MeasureOrb({ state, label }) {
  const cfg = {
    idle:      { color: '#6B7280', glow: 'rgba(107,114,128,0.2)', pulse: false },
    listening: { color: '#EF4444', glow: 'rgba(239,68,68,0.3)',   pulse: true  },
    thinking:  { color: GOLD,      glow: 'rgba(201,168,76,0.3)',  pulse: true  },
    speaking:  { color: '#3B82F6', glow: 'rgba(59,130,246,0.3)', pulse: true  },
    done:      { color: '#22C55E', glow: 'rgba(34,197,94,0.3)',   pulse: false },
  }[state] || { color: '#6B7280', glow: 'rgba(0,0,0,0.1)', pulse: false };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <div style={{ position: 'relative', width: 110, height: 110 }}>
        {cfg.pulse && (
          <div style={{ position: 'absolute', inset: -18, borderRadius: '50%', background: cfg.glow, animation: 'voicePulse 1.5s ease-in-out infinite' }} />
        )}
        <div style={{
          width: 110, height: 110, borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, ${cfg.color}dd, ${cfg.color}88)`,
          boxShadow: `0 0 36px ${cfg.glow}, 0 8px 24px rgba(0,0,0,0.25)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, transition: 'background 0.3s, box-shadow 0.3s',
        }}>
          {state === 'idle' ? '📐' : state === 'listening' ? '🎙' : state === 'thinking' ? '✦' : state === 'done' ? '✓' : '🔊'}
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5, minHeight: 20, textAlign: 'center' }}>
        {label}
      </div>
    </div>
  );
}

export default function MeasureScr({ jobs = [], onBack }) {
  const [selectedJobId, setSelectedJobId] = useState('');
  const [orbState, setOrbState] = useState('idle');
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [interimText, setInterimText] = useState('');
  const [messages, setMessages] = useState([]);
  const [log, setLog] = useState([]); // { role, text } for display
  const [complete, setComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [started, setStarted] = useState(false);
  const [transcript, setTranscript] = useState(''); // loaded from job docs

  const recognitionRef = useRef(null);
  const voicesRef = useRef([]);
  const stateRef = useRef('idle');
  const messagesRef = useRef([]);
  const logRef = useRef(null);

  const setState = s => { stateRef.current = s; setOrbState(s); };

  const selectedJob = jobs.find(j => j.id === selectedJobId) || null;

  // Load voices on mount
  useEffect(() => {
    const load = () => { voicesRef.current = window.speechSynthesis?.getVoices() || []; };
    load();
    window.speechSynthesis?.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', load);
  }, []);

  // Load transcript from job docs when job selected
  useEffect(() => {
    if (!selectedJobId) { setTranscript(''); return; }
    sbLoadDocs(selectedJobId).then(docs => {
      const t = docs.find(d => d.file_type === 'transcript' || d.file_type === 'measurements');
      if (t?.name) setTranscript(t.name); // we'll use name as a hint, actual content loaded below
    });
  }, [selectedJobId]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const speak = useCallback((text, onDone) => {
    if (!window.speechSynthesis) { onDone?.(); return; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text.replace(/[*_#`]/g, ''));
    const voices = voicesRef.current;
    const preferred = voices.find(v => /Samantha|Karen|Google US|en-US/i.test(v.name)) ||
                      voices.find(v => v.lang === 'en-US') || voices[0];
    if (preferred) utt.voice = preferred;
    utt.rate = 0.95; utt.pitch = 1.0; utt.volume = 1.0;
    utt.onend = () => onDone?.();
    utt.onerror = () => onDone?.();
    window.speechSynthesis.speak(utt);
  }, []);

  const startListening = useCallback(() => {
    if (stateRef.current !== 'speaking' && stateRef.current !== 'thinking') {
      setState('listening');
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    recognitionRef.current = r;
    r.continuous = false;
    r.interimResults = true;
    r.lang = 'en-US';

    r.onresult = e => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      setInterimText(interim || final);
      if (final) {
        setInterimText('');
        r.stop();
        sendToGuide(final.trim());
      }
    };
    r.onerror = e => {
      if (e.error === 'no-speech') { r.stop(); setTimeout(startListening, 300); }
      else if (e.error !== 'aborted') setState('idle');
    };
    r.onend = () => { if (stateRef.current === 'listening') setTimeout(startListening, 300); };
    try { r.start(); } catch {}
  }, []);

  const sendToGuide = useCallback(async (userText) => {
    setState('thinking');
    setInterimText('');
    const newMessages = [...messagesRef.current, { role: 'user', content: userText }];
    messagesRef.current = newMessages;
    setMessages(newMessages);
    setLog(l => [...l, { role: 'user', text: userText }]);

    try {
      const res = await fetch(MEASURE_GUIDE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          messages: newMessages,
          job: selectedJob ? { address: selectedJob.address, scope: selectedJob.scope, sqft: selectedJob.sqft } : {},
          transcript,
        }),
      });
      const data = await res.json();
      const reply = data.reply || 'Got it, keep going.';
      const isDone = data.complete || false;

      const withAssistant = [...newMessages, { role: 'assistant', content: reply }];
      messagesRef.current = withAssistant;
      setMessages(withAssistant);
      setLog(l => [...l, { role: 'assistant', text: reply }]);
      setCurrentPrompt(reply);

      if (isDone) {
        setComplete(true);
        setState('done');
        speak(reply);
      } else {
        setState('speaking');
        speak(reply, () => {
          if (stateRef.current !== 'done') startListening();
        });
      }
    } catch {
      setState('listening');
      startListening();
    }
  }, [selectedJob, transcript, speak, startListening]);

  const startSession = async () => {
    if (!selectedJob) return;
    // Unlock iOS TTS synchronously
    const unlock = new SpeechSynthesisUtterance('');
    window.speechSynthesis?.speak(unlock);
    window.speechSynthesis?.cancel();

    // Release getUserMedia so SpeechRecognition can take it
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch {}

    setStarted(true);
    setMessages([]);
    messagesRef.current = [];
    setLog([]);
    setComplete(false);
    setSaved(false);
    setState('thinking');

    const greeting = `Ready to measure ${selectedJob.address}. Let's start — measure the ${getFirstRoom(selectedJob.scope)} length wall to wall.`;
    const initMessages = [{ role: 'user', content: 'Start the measurement session.' }];

    try {
      const res = await fetch(MEASURE_GUIDE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          messages: initMessages,
          job: { address: selectedJob.address, scope: selectedJob.scope, sqft: selectedJob.sqft },
          transcript,
        }),
      });
      const data = await res.json();
      const reply = data.reply || greeting;
      const withAssistant = [...initMessages, { role: 'assistant', content: reply }];
      messagesRef.current = withAssistant;
      setMessages(withAssistant);
      setLog([{ role: 'assistant', text: reply }]);
      setCurrentPrompt(reply);
      setState('speaking');
      speak(reply, () => { setTimeout(startListening, 300); });
    } catch {
      setState('idle');
    }
  };

  const getFirstRoom = scope => {
    if (/kitchen/i.test(scope)) return 'kitchen';
    if (/bath/i.test(scope)) return 'bathroom';
    if (/bedroom|bed room/i.test(scope)) return 'bedroom';
    if (/living/i.test(scope)) return 'living room';
    return 'main room';
  };

  const saveMeasurements = async () => {
    if (!selectedJob || !messages.length) return;
    setSaving(true);
    // Format transcript
    const content = log.map(l => `${l.role === 'user' ? 'Field Rep' : 'Guide'}: ${l.text}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const file = new File([blob], `measurements_${selectedJob.address.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.txt`, { type: 'text/plain' });
    await sbUploadDoc(selectedJob.id, file, 'measurements');
    setSaving(false);
    setSaved(true);
  };

  const stopSession = () => {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    setState('idle');
    setStarted(false);
    setCurrentPrompt('');
    setInterimText('');
  };

  const mobile = isMob();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: NAVY, minHeight: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={() => { stopSession(); onBack(); }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1 }}>←</button>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: '#fff' }}>Field Measure</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase' }}>Voice-guided measurement session</div>
        </div>
      </div>

      {/* Job picker */}
      {!started && (
        <div style={{ padding: 20, borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Select Project</div>
          <select
            value={selectedJobId}
            onChange={e => setSelectedJobId(e.target.value)}
            style={{ width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: selectedJobId ? '#fff' : 'rgba(255,255,255,0.4)', borderRadius: 8, padding: '10px 14px', fontSize: 14, fontFamily: "'DM Sans',sans-serif", outline: 'none' }}>
            <option value="">— Choose a project —</option>
            {jobs.filter(j => !['complete'].includes(j.status)).map(j => (
              <option key={j.id} value={j.id} style={{ background: NAVY, color: '#fff' }}>{j.address}{j.scope ? ` · ${j.scope.slice(0, 40)}` : ''}</option>
            ))}
          </select>
          {selectedJob?.scope && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '8px 12px' }}>
              <strong style={{ color: GOLD }}>Scope:</strong> {selectedJob.scope}
            </div>
          )}
        </div>
      )}

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: started ? 'flex-start' : 'center', padding: 20, gap: 20, minHeight: 0, overflowY: 'auto' }}>
        {!started ? (
          // Start screen
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%', maxWidth: 400 }}>
            <MeasureOrb state="idle" label="Ready to measure" />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, marginBottom: 8 }}>
                I'll walk you through every measurement the estimator needs — one at a time, out loud.
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Select a project above, then tap Start.</div>
            </div>
            <button
              onClick={startSession}
              disabled={!selectedJob}
              style={{ background: selectedJob ? GOLD : 'rgba(255,255,255,0.1)', color: selectedJob ? NAVY : 'rgba(255,255,255,0.3)', border: 'none', borderRadius: 12, padding: '16px 40px', fontSize: 16, fontWeight: 700, cursor: selectedJob ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans',sans-serif", transition: 'all 0.2s' }}>
              🎙 Start Measuring
            </button>
          </div>
        ) : (
          // Active session
          <>
            {/* Orb */}
            <div style={{ paddingTop: 12 }}>
              <MeasureOrb
                state={orbState}
                label={
                  orbState === 'listening' ? (interimText || 'Listening…') :
                  orbState === 'thinking'  ? 'Thinking…' :
                  orbState === 'speaking'  ? 'Speaking…' :
                  orbState === 'done'      ? 'Session complete' :
                  'Tap orb to respond'
                }
              />
            </div>

            {/* Current prompt box */}
            {currentPrompt && (
              <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 12, padding: '14px 18px', width: '100%', maxWidth: 480 }}>
                <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Guide</div>
                <div style={{ fontSize: 15, color: '#fff', lineHeight: 1.65 }}>{currentPrompt}</div>
              </div>
            )}

            {/* Tap orb to speak manually */}
            {orbState === 'idle' && !complete && (
              <button onClick={startListening} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444', borderRadius: 10, padding: '10px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                🎙 Tap to Respond
              </button>
            )}

            {/* Measurement log */}
            {log.length > 0 && (
              <div ref={logRef} style={{ width: '100%', maxWidth: 480, maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Session Log</div>
                {log.map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: l.role === 'user' ? '#4ADE80' : GOLD, textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0, marginTop: 2, minWidth: 36 }}>{l.role === 'user' ? 'You' : 'AI'}</div>
                    <div style={{ fontSize: 13, color: l.role === 'user' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{l.text}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', paddingBottom: 20 }}>
              {complete && !saved && (
                <button onClick={saveMeasurements} disabled={saving} style={{ background: '#22C55E', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                  {saving ? 'Saving…' : '💾 Save to Job'}
                </button>
              )}
              {saved && (
                <div style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ADE80', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 700 }}>
                  ✓ Saved to {selectedJob?.address}
                </div>
              )}
              <button onClick={stopSession} style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '12px 20px', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                End Session
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
