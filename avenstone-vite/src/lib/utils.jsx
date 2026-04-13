// ─── Job status helpers ───────────────────────────────────────────────────────
const STATUS_MAP = [
  { id: 'lead',      lb: 'Lead',        c: '#6366f1' },
  { id: 'bid_sent',  lb: 'Bid Sent',    c: '#f59e0b' },
  { id: 'signed',    lb: 'Signed',      c: '#22c55e' },
  { id: 'active',    lb: 'Active',      c: '#3B82F6' },
  { id: 'demo',      lb: 'Demo',        c: '#ef4444' },
  { id: 'framing',   lb: 'Framing',     c: '#f97316' },
  { id: 'rough_mep', lb: 'Rough MEP',   c: '#eab308' },
  { id: 'drywall',   lb: 'Drywall',     c: '#84cc16' },
  { id: 'finish',    lb: 'Finish Work', c: '#14b8a6' },
  { id: 'punch',     lb: 'Punch List',  c: '#06b6d4' },
  { id: 'complete',  lb: 'Complete',    c: '#22c55e' },
  { id: 'on_hold',   lb: 'On Hold',     c: '#9CA3AF' },
];
const SC = id => STATUS_MAP.find(s => s.id === id) || { c: '#9CA3AF', lb: id };
export const sc = id => SC(id).c;   // status color
export const sl = id => SC(id).lb;  // status label
export const STATS = STATUS_MAP;

// ─── Phase status helpers ─────────────────────────────────────────────────────
export const phSc = s => ({ not_started: '#9CA3AF', in_progress: '#3B82F6', complete: '#22c55e', blocked: '#ef4444' }[s] || '#9CA3AF');
export const phSl = s => ({ not_started: 'Not Started', in_progress: 'In Progress', complete: 'Complete', blocked: 'Blocked' }[s] || s);

// Google Calendar URL for a phase
export const gcalUrl = (ph, addr) => {
  if (!ph.start_date || !ph.end_date) return null;
  const s = ph.start_date.replace(/-/g, '');
  const ed = new Date(ph.end_date); ed.setDate(ed.getDate() + 1);
  const e = ed.toISOString().slice(0, 10).replace(/-/g, '');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ph.phase_name + ' \u2014 ' + addr)}&dates=${s}/${e}&details=${encodeURIComponent('Avenstone project phase: ' + ph.phase_name)}`;
};

// ─── Formatters ───────────────────────────────────────────────────────────────
export const f$ = n => `$${Number(n || 0).toLocaleString()}`;
export const fD = d => { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return d || ''; } };
export const fDT = d => { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return d || ''; } };

// ─── Storage helpers ──────────────────────────────────────────────────────────
export const ls = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const ll = (k, d) => { try { const x = localStorage.getItem(k); return x ? JSON.parse(x) : d; } catch { return d; } };

// ─── Viewport ─────────────────────────────────────────────────────────────────
export const isMob = () => window.innerWidth < 768;

// ─── Icons ────────────────────────────────────────────────────────────────────
export const Ic = {
  grid:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  home:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>,
  clip:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>,
  doc:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  box:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>,
  back:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15,18 9,12 15,6"/></svg>,
  plus:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  chev:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6,9 12,15 18,9"/></svg>,
  check:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20,6 9,17 4,12"/></svg>,
  edit:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  info:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  note:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>,
  cam:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  vid:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="23,7 16,12 23,17 23,7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,
  warn:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  trash:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>,
  logout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  bell:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  cal:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  sched:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="14" strokeWidth="2"/><line x1="12" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="8" y2="18" strokeWidth="2"/><line x1="12" y1="18" x2="16" y2="18"/></svg>,
  folder: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
  dl:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  eye:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
};
