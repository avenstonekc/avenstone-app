import { useState, useEffect, useRef } from 'react';
import { ANON_KEY, PROCESS_TRANSCRIPT_URL } from '../../../lib/supabase';
import { isMob } from '../../../lib/utils';

const NAV = '#0A1F44';
const BORDER = '#E8E4DC';

function PulseRecording() {
  return (
    <span style={{
      display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
      background: '#EF4444', boxShadow: '0 0 0 0 rgba(239,68,68,0.7)',
      animation: 'pulse-rec 1.4s infinite', marginRight: 8, verticalAlign: 'middle',
    }} />
  );
}

export default function AmbientPanel({
  jobId,
  sessionId,
  getSessionId,
  onTranscriptUpdate,
  onExtractionUpdate,
  onStartMeasuring,
  onEnd,
}) {
  const mob = isMob();
  const [isRecording, setIsRecording] = useState(false);
  const [localTranscript, setLocalTranscript] = useState('');

  const recognitionRef = useRef(null);
  const ambientIntervalRef = useRef(null);
  const transcriptRef = useRef('');

  // Keep transcriptRef in sync
  useEffect(() => {
    transcriptRef.current = localTranscript;
  }, [localTranscript]);

  // Unmount cleanup — non-negotiable: stop mic + clear interval
  useEffect(() => {
    return () => {
      stopMicCleanup();
      if (ambientIntervalRef.current) {
        clearInterval(ambientIntervalRef.current);
        ambientIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-start mic when panel mounts (session row already created by parent)
  useEffect(() => {
    startMic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getHeaders = () => ({
    Authorization: `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
  });

  const flushTranscript = () => {
    const chunk = transcriptRef.current;
    if (!chunk || chunk.trim().length < 20) return;
    const sid = getSessionId() || sessionId;
    fetch(PROCESS_TRANSCRIPT_URL, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        session_id: sid,
        job_id: jobId,
        transcript_chunk: chunk,
        mode: 'ambient',
      }),
    }).catch(() => {});
  };

  const startMic = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return;

      const accumulatedRef = { current: transcriptRef.current };
      const stillRecording = { current: true };

      const startRecog = () => {
        if (!stillRecording.current) return;
        const recog = new SpeechRecognition();
        recog.continuous = true;
        recog.interimResults = true;
        recog.lang = 'en-US';

        recog.onresult = (e) => {
          let newText = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) newText += e.results[i][0].transcript + ' ';
          }
          if (newText) {
            accumulatedRef.current = (accumulatedRef.current + ' ' + newText).trim();
            setLocalTranscript(accumulatedRef.current);
            onTranscriptUpdate(accumulatedRef.current);
          }
        };

        recog.onerror = (e) => {
          if (e.error === 'not-allowed') stillRecording.current = false;
        };

        recog.onend = () => {
          if (stillRecording.current) setTimeout(startRecog, 300);
        };

        recog.start();
        recognitionRef.current = recog;
      };

      startRecog();
      // Wrap stop in a closure so cleanup can call it
      recognitionRef.current = {
        stop: () => { stillRecording.current = false; recognitionRef.current?.abort?.(); },
      };
      setIsRecording(true);

      // Start 60s flush interval
      const sid = getSessionId() || sessionId;
      startAmbientInterval(sid);
    } catch (e) {
      // Mic denied — shows paused state
    }
  };

  const stopMicCleanup = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  const stopMic = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
  };

  const startAmbientInterval = (sid) => {
    if (ambientIntervalRef.current) clearInterval(ambientIntervalRef.current);
    ambientIntervalRef.current = setInterval(async () => {
      const chunk = transcriptRef.current;
      if (!chunk || chunk.trim().length < 20) return;
      try {
        const currentSid = getSessionId() || sid;
        const res = await fetch(PROCESS_TRANSCRIPT_URL, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            session_id: currentSid,
            job_id: jobId,
            transcript_chunk: chunk,
            mode: 'ambient',
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        if (json.extraction) onExtractionUpdate(json.extraction);
      } catch (e) {
        console.error('Ambient processing error:', e);
      }
    }, 60000);
  };

  const handleStartMeasuring = () => {
    flushTranscript();
    onStartMeasuring();
  };

  const handleEnd = () => {
    flushTranscript();
    onEnd();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        {isRecording && <PulseRecording />}
        <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 20, color: NAV }}>
          {isRecording ? 'Ambient Recording Active' : 'Session Paused'}
        </span>
        <button
          className="btn btn-ghost"
          style={{ marginLeft: 'auto', fontSize: 13 }}
          onClick={isRecording ? stopMic : startMic}
        >
          {isRecording ? 'Pause Mic' : 'Resume Mic'}
        </button>
      </div>

      {/* Live transcript */}
      <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, fontWeight: 700 }}>
          Live Transcript
        </div>
        <div style={{
          fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#374151',
          lineHeight: 1.6, minHeight: 64, maxHeight: 140, overflowY: 'auto', whiteSpace: 'pre-wrap',
        }}>
          {localTranscript
            ? localTranscript.slice(-500)
            : <span style={{ color: '#D1D5DB', fontStyle: 'italic' }}>Listening for conversation…</span>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: mob ? 'column' : 'row', gap: 10 }}>
        <button className="btn btn-navy" style={{ flex: 1 }} onClick={handleStartMeasuring}>
          Start Measuring
        </button>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={handleEnd}>
          End Session
        </button>
      </div>
    </div>
  );
}
