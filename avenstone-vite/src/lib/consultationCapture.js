// CONSULTATION_MODE Slice 1 — continuous, long-session speech capture.
//
// The old AmbientPanel used the browser Web Speech API (window.webkitSpeechRecognition),
// which DOES NOT EXIST in the Capacitor iOS WKWebView — so ambient capture was dead on the
// actual phone. This controller is platform-adaptive:
//   • Native iOS  → @capgo/capacitor-speech-recognition (SFSpeechRecognizer), the real field path.
//   • Desktop/web → Web Speech API fallback, so the flow stays testable in a browser.
//
// SFSpeechRecognizer ends a recognition task roughly every ~60s. A 2-hour consultation
// therefore needs an auto-restart loop: we proactively cycle the recognizer every
// RESTART_MS, promoting the current in-progress hypothesis to a finalized SEGMENT, then
// restart. Each segment is emitted via onSegment so the caller can flush only the delta
// (never the whole growing transcript). onPartial carries the live hypothesis for
// hot-word matching (slice 2).
//
// TRANSCRIPT ONLY — no audio is ever written to disk or uploaded. iOS processes the audio
// buffer in-memory; we keep the text.

import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';

// Cycle a hair under Apple's ~60s task ceiling so we finalize before the OS cuts us off.
const RESTART_MS = 45000;
// After an error (not permission), wait before retrying so we don't hot-loop.
const ERROR_RETRY_MS = 800;

export function isNativeCapture() {
  try { return Capacitor?.isNativePlatform?.() === true; } catch { return false; }
}

// Returns a controller: { start, stop, pause, resume, running() }.
// Callbacks (all optional):
//   onSegment(text)  — a finalized chunk of speech (~every RESTART_MS or on task end)
//   onPartial(text)  — the live in-progress hypothesis (resets each restart cycle)
//   onError(message) — a non-fatal error surfaced for UI; 'not-allowed' is fatal
//   onStateChange(bool) — listening true/false
export function createCaptureController({ onSegment, onPartial, onError, onStateChange, contextualStrings = [] } = {}) {
  let running = false;
  let paused = false;
  let cycleTimer = null;
  let currentText = '';          // live hypothesis for the current recognition task
  let listeners = [];            // native plugin listener handles
  let webRecog = null;           // Web Speech instance (fallback)
  const native = isNativeCapture();

  const setState = (b) => { try { onStateChange?.(b); } catch {} };

  const finalizeSegment = () => {
    const seg = currentText.trim();
    currentText = '';
    if (seg.length >= 2) { try { onSegment?.(seg); } catch {} }
  };

  // ── Native path ────────────────────────────────────────────────────────────
  const clearNativeListeners = () => {
    listeners.forEach((h) => { try { h.remove?.(); } catch {} });
    listeners = [];
  };

  const startNativeTask = async () => {
    if (!running || paused) return;
    try {
      const partial = await SpeechRecognition.addListener('partialResults', (evt) => {
        const text = evt?.matches?.[0] ?? '';
        if (!text) return;
        currentText = text;
        try { onPartial?.(text); } catch {}
      });
      const err = await SpeechRecognition.addListener('error', (evt) => {
        const msg = evt?.message || 'recognition error';
        try { onError?.(msg); } catch {}
        // Recycle the task unless we've been stopped.
        cycleNative(ERROR_RETRY_MS);
      });
      listeners = [partial, err];
      // Item 2 — bias the recognizer toward construction/trade vocab (native reads contextualStrings
      // via the Avenstone patch to @capgo/capacitor-speech-recognition; ignored on web).
      await SpeechRecognition.start({ language: 'en-US', partialResults: true, popup: false, contextualStrings });
    } catch (e) {
      try { onError?.(String(e?.message || e)); } catch {}
    }
  };

  // Stop the current task, finalize its text, then start a fresh one after `delay`.
  const cycleNative = async (delay = 0) => {
    if (!running) return;
    if (cycleTimer) { clearTimeout(cycleTimer); cycleTimer = null; }
    clearNativeListeners();
    try { await SpeechRecognition.stop(); } catch {}
    finalizeSegment();
    if (!running || paused) return;
    cycleTimer = setTimeout(async () => {
      await startNativeTask();
      // Schedule the next proactive cycle.
      if (running && !paused) {
        cycleTimer = setTimeout(() => cycleNative(0), RESTART_MS);
      }
    }, delay);
  };

  const startNative = async () => {
    let perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== 'granted') {
      perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== 'granted') {
        try { onError?.('not-allowed'); } catch {}
        running = false;
        setState(false);
        return;
      }
    }
    setState(true);
    await startNativeTask();
    cycleTimer = setTimeout(() => cycleNative(0), RESTART_MS);
  };

  // ── Web fallback ─────────────────────────────────────────────────────────────
  const startWeb = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { try { onError?.('Speech recognition not supported in this browser.'); } catch {} return; }
    const spawn = () => {
      if (!running || paused) return;
      const recog = new SR();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = 'en-US';
      recog.onresult = (e) => {
        let finalText = '';
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += t + ' ';
          else interim += t;
        }
        if (finalText.trim()) { currentText = finalText.trim(); finalizeSegment(); }
        if (interim.trim()) { try { onPartial?.(interim.trim()); } catch {} }
      };
      recog.onerror = (e) => {
        if (e.error === 'not-allowed') { running = false; try { onError?.('not-allowed'); } catch {} setState(false); }
      };
      recog.onend = () => { if (running && !paused) setTimeout(spawn, 300); };
      recog.start();
      webRecog = recog;
    };
    setState(true);
    spawn();
  };

  return {
    running: () => running,
    async start() {
      if (running) return;
      running = true;
      paused = false;
      currentText = '';
      if (native) await startNative();
      else startWeb();
    },
    pause() {
      paused = true;
      if (cycleTimer) { clearTimeout(cycleTimer); cycleTimer = null; }
      if (native) { clearNativeListeners(); SpeechRecognition.stop().catch(() => {}); finalizeSegment(); }
      else { try { webRecog?.stop?.(); } catch {} webRecog = null; }
      setState(false);
    },
    async resume() {
      if (!running || !paused) return;
      paused = false;
      if (native) { await startNativeTask(); cycleTimer = setTimeout(() => cycleNative(0), RESTART_MS); }
      else startWeb();
      setState(true);
    },
    stop() {
      running = false;
      paused = false;
      if (cycleTimer) { clearTimeout(cycleTimer); cycleTimer = null; }
      if (native) { clearNativeListeners(); SpeechRecognition.stop().catch(() => {}); }
      else { try { webRecog?.stop?.(); } catch {} webRecog = null; }
      finalizeSegment();
      setState(false);
    },
  };
}
