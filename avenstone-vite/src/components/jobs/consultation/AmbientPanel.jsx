import { useState, useEffect, useRef } from 'react';
import { ANON_KEY, PROCESS_TRANSCRIPT_URL, sbUploadConsultationPhoto } from '../../../lib/supabase';
import { isMob } from '../../../lib/utils';
import { createCaptureController, isNativeCapture } from '../../../lib/consultationCapture';

const NAV = 'var(--navy-900)';
const BORDER = 'var(--border)';

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
  const [photoCount, setPhotoCount] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState('');
  const [pocket, setPocket] = useState(false);
  const [micErr, setMicErr] = useState('');

  const controllerRef = useRef(null);
  const transcriptRef = useRef('');
  const fileInputRef = useRef(null);

  const getHeaders = () => ({
    Authorization: `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
  });

  // Flush ONE finalized segment (the delta) — never the whole growing transcript.
  // process-transcript merges arrays server-side, so per-segment posts accumulate
  // the extraction in the DB while keeping each call tiny (~45s of speech).
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
        const ext = json?.extraction || json?.extracted;
        if (ext) onExtractionUpdate?.(ext);
      })
      .catch(() => {});
  };

  // Mount: build the platform-adaptive capture controller and start it.
  useEffect(() => {
    const controller = createCaptureController({
      onSegment: (seg) => {
        transcriptRef.current = (transcriptRef.current + ' ' + seg).trim();
        setLocalTranscript(transcriptRef.current);
        onTranscriptUpdate?.(transcriptRef.current);
        flushSegment(seg);
      },
      onPartial: () => { /* hot-word matching hooks in here in slice 2 */ },
      onError: (msg) => {
        if (msg === 'not-allowed') setMicErr('Microphone/speech access denied — enable it in Settings.');
        setIsRecording(false);
      },
      onStateChange: (b) => setIsRecording(b),
    });
    controllerRef.current = controller;
    controller.start();
    return () => { controller.stop(); };
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
    const res = await sbUploadConsultationPhoto({ jobId, sessionId: sid, file, sort: photoCount });
    setPhotoBusy(false);
    if (res.error) { setPhotoMsg(`Photo failed: ${res.error}`); }
    else { setPhotoCount((n) => n + 1); setPhotoMsg('Photo captured'); setTimeout(() => setPhotoMsg(''), 2500); }
  };

  const finishTo = (cb) => {
    controllerRef.current?.stop();  // finalizes + flushes the tail segment
    cb?.();
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

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        {isRecording && <PulseRecording />}
        <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 20, color: NAV }}>
          {isRecording ? 'Ambient Recording Active' : 'Session Paused'}
        </span>
        <button
          className="btn btn-ghost"
          style={{ marginLeft: 'auto', fontSize: 16, minHeight: 44 }}
          onClick={toggleMic}
        >
          {isRecording ? 'Pause Mic' : 'Resume Mic'}
        </button>
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
        <button className="btn btn-ghost" style={{ flex: 1, minHeight: 48 }} onClick={() => finishTo(onEnd)}>
          End Session
        </button>
      </div>
    </div>
  );
}
