// CONSULTATION_POCKET_FALLBACK FIX 1 — keep the screen awake during an active consultation
// so the phone never auto-locks. Field-confirmed 2026-07-18: on screen lock the OS suspends
// the app and kills SFSpeechRecognizer — UIBackgroundModes: audio is NOT enough. Keeping the
// screen on (paired with 🌙 pocket-dim) is plan B.
//
// Uses the web Screen Wake Lock API — supported in modern iOS WKWebView + desktop, a graceful
// no-op elsewhere. Deliberately NOT the native @capacitor-community/keep-awake plugin: adding a
// Capacitor plugin touches package.json + node_modules, which are shared across the parallel
// Claude instances (and needs a Capacitor sync). The wake lock is auto-released by the OS when
// the page is hidden, so the caller must re-acquire on visibilitychange → visible.
//
// ESCALATION: if a field test shows the lock doesn't hold in the WKWebView, swap this for the
// native plugin (UIApplication.isIdleTimerDisabled) — that's the bulletproof idle-timer disable.

export function createScreenWake() {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  let sentinel = null;

  const acquire = async () => {
    if (!supported || sentinel) return !!sentinel;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      // The sentinel fires 'release' when the OS drops it (e.g. page hidden) — clear our ref
      // so a later acquire() re-requests instead of thinking it's still held.
      sentinel.addEventListener?.('release', () => { sentinel = null; });
      return true;
    } catch {
      sentinel = null;
      return false;
    }
  };

  const release = async () => {
    try { await sentinel?.release?.(); } catch { /* already gone */ }
    sentinel = null;
  };

  return {
    acquire,
    release,
    get held() { return !!sentinel; },
    supported,
  };
}
