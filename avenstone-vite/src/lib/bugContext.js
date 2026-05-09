// bugContext.js — in-memory ring buffers + global error capture for bug reports
// App version — bumped manually when significant features ship
const APP_VERSION = '1.0.0';

// Ring buffer helper
function makeRing(maxSize) {
  const buf = [];
  return {
    push(item) {
      buf.push(item);
      if (buf.length > maxSize) buf.shift();
    },
    toArray() { return [...buf]; },
  };
}

const breadcrumbRing  = makeRing(20);
const consoleErrorRing = makeRing(10);
const networkErrorRing = makeRing(10);

let _initialized = false;

export function pushBreadcrumb({ type, label, route }) {
  breadcrumbRing.push({ ts: new Date().toISOString(), type, label, route });
}

export function pushNetworkError({ type, message, source }) {
  networkErrorRing.push({ ts: new Date().toISOString(), type, message, source });
}

function pushConsoleError({ message, stack }) {
  consoleErrorRing.push({ ts: new Date().toISOString(), message, stack });
}

export function getSnapshot() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  let device = 'unknown';
  let os = 'unknown';

  if (ua) {
    if (/iPhone/.test(ua)) device = 'iPhone';
    else if (/iPad/.test(ua)) device = 'iPad';
    else if (/Android/.test(ua)) device = 'Android';
    else if (/Macintosh/.test(ua)) device = 'Mac';
    else if (/Windows/.test(ua)) device = 'Windows';

    if (/iPhone OS ([\d_]+)/.test(ua)) os = 'iOS ' + ua.match(/iPhone OS ([\d_]+)/)[1].replace(/_/g, '.');
    else if (/Android ([\d.]+)/.test(ua)) os = 'Android ' + ua.match(/Android ([\d.]+)/)[1];
    else if (/Mac OS X ([\d_]+)/.test(ua)) os = 'macOS ' + ua.match(/Mac OS X ([\d_]+)/)[1].replace(/_/g, '.');
    else if (/Windows NT ([\d.]+)/.test(ua)) os = 'Windows ' + ua.match(/Windows NT ([\d.]+)/)[1];
  }

  const route = breadcrumbRing.toArray().filter(b => b.type === 'nav').slice(-1)[0]?.route || 'unknown';

  return {
    breadcrumbs: breadcrumbRing.toArray(),
    consoleErrors: consoleErrorRing.toArray(),
    networkErrors: networkErrorRing.toArray(),
    route,
    version: APP_VERSION,
    device,
    os,
    ts: new Date().toISOString(),
  };
}

export function initBugContext() {
  if (_initialized) return;
  _initialized = true;

  // Wrap console.error
  const origConsoleError = console.error.bind(console);
  console.error = (...args) => {
    origConsoleError(...args);
    const message = args.map(a => {
      if (a instanceof Error) return a.message;
      try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch { return String(a); }
    }).join(' ');
    const stack = args.find(a => a instanceof Error)?.stack || '';
    pushConsoleError({ message, stack });
  };

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason || 'Unhandled rejection');
    const source = reason instanceof Error ? reason.stack || '' : '';
    pushNetworkError({ type: 'unhandled_rejection', message, source });
  });

  // Global JS errors
  window.addEventListener('error', (event) => {
    const message = event.message || 'Unknown error';
    const source = `${event.filename || ''}:${event.lineno || ''}:${event.colno || ''}`;
    pushNetworkError({ type: 'window_error', message, source });
  });
}
