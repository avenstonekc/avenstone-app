import { useState, useEffect, useRef, useMemo } from 'react';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import {
  ANON_KEY, PROCESS_TRANSCRIPT_URL,
  sbUploadConsultationPhoto, sbLoadConsultationChecklist, sbGetHotwordPrefix,
} from '../../../lib/supabase';
import { isMob } from '../../../lib/utils';
import { createCaptureController, isNativeCapture } from '../../../lib/consultationCapture';
import { buildNeedsList, needsListSpeech, evidenceStyle } from '../../../lib/consultationCoach';
import { buildContextualStrings } from '../../../lib/consultationVocab';

const NAV = 'var(--navy-900)';
const BORDER = 'var(--border)';
const CMD_DEBOUNCE_MS = 5000;

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
  tradeScope = null,
  onTranscriptUpdate,
  onExtractionUpdate,
  onStartMeasuring,
  onEnd,
}) {
  const mob = isMob();
  const [isRecording, setIsRecording] = useState(false);
  const [localTranscript, setLocalTranscript] = useState('');
  const [photoCount, setPhotoCount] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState('');
  const [pocket, setPocket] = useState(false);
  const [micErr, setMicErr] = useState('');
  const [voiceOn, setVoiceOn] = useState(true);
  const [answers, setAnswers] = useState({});
  const [firedModules, setFiredModules] = useState([]);
  const [checklist, setChecklist] = useState({ fields: [], modules: [] });
  const [ending, setEnding] = useState(false);

  const controllerRef = useRef(null);
  const transcriptRef = useRef('');
  const fileInputRef = useRef(null);
  const prefixRef = useRef('avenstone');
  const livePartialRef = useRef('');
  const lastCmdRef = useRef({ cmd: '', ts: 0 });
  const voiceOnRef = useRef(true);
  const needsRef = useRef([]);

  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);

  const needs = useMemo(
    () => buildNeedsList({ fields: checklist.fields, modules: checklist.modules, answers, firedModules, tradeScope }),
    [checklist, answers, firedModules, tradeScope],
  );
  useEffect(() => { needsRef.current = needs; }, [needs]);

  const getHeaders = () => ({
    Authorization: `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
  });

  // Load the coach checklist + hot-word prefix once.
  useEffect(() => {
    let alive = true;
    sbLoadConsultationChecklist(jobId).then((c) => { if (alive) setChecklist(c); }).catch(() => {});
    sbGetHotwordPrefix().then((p) => { prefixRef.current = p; }).catch(() => {});
    return () => { alive = false; };
  }, [jobId]);

  // ── TTS with interleave: pause recognition → speak → resume (audio-session isolation
  //    is already solved by the TTS plugin; we still pause capture so we don't transcribe
  //    our own voice). Voice-out is on-demand + end-gate ONLY — never auto-interjects. ──
  const speak = async (text) => {
    if (!voiceOnRef.current || !text) return;
    const c = controllerRef.current;
    const wasRunning = c?.running?.();
    try { c?.pause?.(); } catch {}
    try {
      await TextToSpeech.speak({ text, lang: 'en-US', rate: 1.0, category: 'playback' });
    } catch {}
    if (wasRunning && !ending) { try { await c?.resume?.(); } catch {} }
  };

  // Flush ONE finalized segment (the delta) and fold the coach state forward.
  const flushSegment = (seg) => {
    if (!seg || seg.trim().length < 2) return;
    const sid = getSessionId?.() || sessionId;
    if (!sid) return;
    fetch(PROCESS_TRANSCRIPT_URL, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ session_id: sid, job_id: jobId, transcript_chunk: seg, mode: 'ambient' }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const ext = json?.extraction;
        if (!ext) return;
        onExtractionUpdate?.(ext);
        if (ext.checklist_answers && typeof ext.checklist_answers === 'object') setAnswers(ext.checklist_answers);
        if (Array.isArray(ext.fired_modules)) setFiredModules(ext.fired_modules);
      })
      .catch(() => {});
  };

  // ── Hot-word matcher on the live partial stream. Requires the tenant prefix so normal
  //    client conversation can't trip it. Debounced per command. ──────────────────────
  const fireCommand = (cmd) => {
    const now = Date.now();
    if (lastCmdRef.current.cmd === cmd && now - lastCmdRef.current.ts < CMD_DEBOUNCE_MS) return;
    lastCmdRef.current = { cmd, ts: now };
    if (cmd === 'measure') finishTo(onStartMeasuring);
    else if (cmd === 'ambient') controllerRef.current?.resume?.();
    else if (cmd === 'missing') speak(needsListSpeech(needsRef.current));
    else if (cmd === 'end') handleEnd();
  };

  const handlePartial = (text) => {
    livePartialRef.current = text || '';
    const t = (text || '').toLowerCase();
    const prefix = prefixRef.current;
    if (!t.includes(prefix)) return;
    const after = t.slice(t.lastIndexOf(prefix) + prefix.length);
    if (/\bwhat('?s| is| am i| are we)?\b.*\bmissing\b|\bmissing\b/.test(after)) fireCommand('missing');
    else if (/\bend (the )?session\b|\bwrap up\b|\bwe'?re done\b/.test(after)) fireCommand('end');
    else if (/\bmeasure\b/.test(after)) fireCommand('measure');
    else if (/\bambient\b|\blisten\b|\bkeep listening\b/.test(after)) fireCommand('ambient');
  };

  // Mount: build the platform-adaptive capture controller and start it.
  useEffect(() => {
    const controller = createCaptureController({
      // Item 2 — construction/trade vocab + tenant hot-word prefix bias the recognizer (native only).
      contextualStrings: buildContextualStrings(prefixRef.current),
      onSegment: (seg) => {
        transcriptRef.current = (transcriptRef.current + ' ' + seg).trim();
        setLocalTranscript(transcriptRef.current);
        onTranscriptUpdate?.(transcriptRef.current);
        flushSegment(seg);
      },
      onPartial: handlePartial,
      onError: (msg) => {
        if (msg === 'not-allowed') setMicErr('Microphone/speech access denied — enable it in Settings.');
        setIsRecording(false);
      },
      onStateChange: (b) => setIsRecording(b),
    });
    controllerRef.current = controller;
    controller.start();
    return () => { controller.stop(); TextToSpeech.stop().catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = () => {
    const c = controllerRef.current;
    if (!c) return;
    if (isRecording) c.pause();
    else c.resume();
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    setPhotoMsg('');
    const sid = getSessionId?.() || sessionId;
    // Shutter-time context: the words spoken around the moment the photo was taken →
    // the recap turns this into a speech-derived caption (no vision call).
    const shutterContext = `${transcriptRef.current} ${livePartialRef.current}`.trim();
    const res = await sbUploadConsultationPhoto({ jobId, sessionId: sid, file, sort: photoCount, transcriptContext: shutterContext });
    setPhotoBusy(false);
    if (res.error) { setPhotoMsg(`Photo failed: ${res.error}`); }
    else { setPhotoCount((n) => n + 1); setPhotoMsg('Photo captured'); setTimeout(() => setPhotoMsg(''), 2500); }
  };

  const finishTo = (cb) => {
    controllerRef.current?.stop();  // finalizes + flushes the tail segment
    cb?.();
  };

  // End-of-session gate: speak the open needs-list before leaving, THEN end.
  const handleEnd = async () => {
    if (ending) return;
    setEnding(true);
    const items = needsRef.current;
    if (items.length && voiceOnRef.current) {
      controllerRef.current?.pause?.();
      try { await TextToSpeech.speak({ text: `Before you leave the driveway — ${needsListSpeech(items)}`, lang: 'en-US', rate: 1.0, category: 'playback' }); } catch {}
    }
    finishTo(onEnd);
  };

  // ── Pocket mode: near-black low-power overlay so the rep can pocket the phone
  //    while capture keeps running. Tap anywhere to return. ──────────────────────
  if (pocket) {
    return (
      <div
        onClick={() => setPocket(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 2000, background: '#000',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: '#1f2937', cursor: 'pointer', paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: isRecording ? '#374151' : '#7f1d1d' }}>
          {isRecording && <PulseRecording />}
          <span style={{ fontSize: 15, letterSpacing: 0.5 }}>
            {isRecording ? 'Listening — screen dimmed' : 'Paused'}
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#111827', marginTop: 14 }}>Tap to wake</div>
      </div>
    );
  }

  return (
    <div>
      {micErr && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', marginBottom: 12, color: 'var(--red-text-strong)', fontSize: 13 }}>
          {micErr}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        {isRecording && <PulseRecording />}
        <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 20, color: NAV }}>
          {isRecording ? 'Ambient Recording Active' : 'Session Paused'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 16, minHeight: 44 }}
            onClick={() => setVoiceOn((v) => { const n = !v; if (!n) TextToSpeech.stop().catch(() => {}); return n; })}
            title="Voice replies"
          >
            {voiceOn ? '🔊 Voice' : '🔇 Muted'}
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 16, minHeight: 44 }} onClick={toggleMic}>
            {isRecording ? 'Pause Mic' : 'Resume Mic'}
          </button>
        </div>
      </div>

      {/* Hot-word hint */}
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>
        Say “<strong style={{ color: '#C9A84C', textTransform: 'capitalize' }}>{prefixRef.current}</strong>, what am I missing?” · “{prefixRef.current}, measure” · “{prefixRef.current}, end session”
      </div>

      {/* Live transcript */}
      <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
          <span>Live Transcript</span>
          <span style={{ color: '#C9A84C' }}>{isNativeCapture() ? 'on-device mic' : 'browser mic'}</span>
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

      {/* Live needs-list (quiet running panel) */}
      {needs.length > 0 && (
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
              Still to cover ({needs.length})
            </span>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 13, padding: '4px 10px', minHeight: 32 }}
              onClick={() => speak(needsListSpeech(needs))}
            >
              🔊 Read
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
            {needs.slice(0, 12).map((it) => {
              const s = evidenceStyle(it.evidence_type);
              return (
                <div key={it.field_key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: '2px 7px', borderRadius: 6, background: s.bg, color: s.color }}>
                    {s.badge}
                  </span>
                  <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.4 }}>{it.question}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* In-flow capture row: photo + pocket. Big touch targets, one-handed. */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhoto}
          style={{ display: 'none' }}
        />
        <button
          className="btn btn-navy"
          style={{ flex: 1, minHeight: 52, fontSize: 16 }}
          disabled={photoBusy}
          onClick={() => fileInputRef.current?.click()}
        >
          {photoBusy ? 'Saving…' : `📷 Photo${photoCount ? ` (${photoCount})` : ''}`}
        </button>
        <button
          className="btn btn-ghost"
          style={{ minWidth: 120, minHeight: 52, fontSize: 16 }}
          onClick={() => setPocket(true)}
        >
          🌙 Pocket
        </button>
      </div>
      {photoMsg && (
        <div style={{ fontSize: 13, color: photoMsg.startsWith('Photo failed') ? '#EF4444' : '#15803d', marginBottom: 12 }}>
          {photoMsg}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: mob ? 'column' : 'row', gap: 10 }}>
        <button className="btn btn-navy" style={{ flex: 1, minHeight: 48 }} onClick={() => finishTo(onStartMeasuring)}>
          Start Measuring
        </button>
        <button className="btn btn-ghost" style={{ flex: 1, minHeight: 48 }} disabled={ending} onClick={handleEnd}>
          {ending ? 'Wrapping up…' : 'End Session'}
        </button>
      </div>
    </div>
  );
}
