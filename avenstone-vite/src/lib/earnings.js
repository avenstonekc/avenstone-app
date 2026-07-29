// TIME_CLOCK_ARC S2 — straight-time earnings math. Pure, no I/O, unit-tested.
// LOCKED v1: STRAIGHT TIME ONLY — no overtime branch. Durations are timezone-independent (UTC
// millisecond diff); only the calendar GROUPING (which year / which Sun–Sat week an entry falls
// in) uses the America/Chicago local date. Entries with no rate on file for their date COUNT
// hours but contribute NO dollars — never priced at $0, never guessed.

const TZ = 'America/Chicago';
const _dtf = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

// clock_in ISO → 'YYYY-MM-DD' local (Chicago) calendar date.
export function chicagoDate(iso) { return _dtf.format(new Date(iso)); }

// Sunday of the week containing a 'YYYY-MM-DD' date, as 'YYYY-MM-DD'. All-UTC math so the
// server's own timezone can never shift the boundary.
export function weekStart(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay()); // back up to Sunday
  return dt.toISOString().slice(0, 10);
}

// Effective rate for a date = the pay-rate row with the greatest effective_date <= dateStr.
// Returns a Number, or null when no rate is on file for that date.
export function effectiveRate(rateRows, dateStr) {
  let best = null;
  for (const r of (rateRows || [])) {
    if (r.effective_date <= dateStr && (!best || r.effective_date > best.effective_date)) best = r;
  }
  return best ? Number(best.rate) : null;
}

const round2 = (n) => Math.round(n * 100) / 100;
const hoursBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 3600000;

// entries: time_entries rows. rateRows: employee_pay_rates. nowIso: reference "now" (for the
// current year/week). Returns straight-time totals + weekly history + no-rate accounting.
export function computeEarnings(entries, rateRows, nowIso) {
  const todayStr = chicagoDate(nowIso);
  const curYear = todayStr.slice(0, 4);
  const curWeek = weekStart(todayStr);
  let ytdHours = 0, ytdGross = 0, weekHours = 0, weekGross = 0, openHours = 0, noRateCount = 0;
  const weeks = new Map(); // weekStart -> { weekStart, hours, gross, hasNoRate }

  for (const e of (entries || [])) {
    if (!e.clock_out) { openHours += Math.max(0, hoursBetween(e.clock_in, nowIso)); continue; } // in-progress, no $
    const dateStr = chicagoDate(e.clock_in);
    const hours = Math.max(0, hoursBetween(e.clock_in, e.clock_out));
    const rate = effectiveRate(rateRows, dateStr);
    const gross = rate != null ? hours * rate : 0; // no rate → hours only, dollars excluded (not $0-priced)
    if (rate == null) noRateCount++;
    const yr = dateStr.slice(0, 4), wk = weekStart(dateStr);
    if (yr === curYear) { ytdHours += hours; ytdGross += gross; }
    if (wk === curWeek) { weekHours += hours; weekGross += gross; }
    const w = weeks.get(wk) || { weekStart: wk, hours: 0, gross: 0, hasNoRate: false };
    w.hours += hours; w.gross += gross; if (rate == null) w.hasNoRate = true;
    weeks.set(wk, w);
  }

  return {
    ytdHours: round2(ytdHours), ytdGross: round2(ytdGross),
    weekHours: round2(weekHours), weekGross: round2(weekGross),
    openHours: round2(openHours), noRateCount,
    weeks: [...weeks.values()]
      .map(w => ({ weekStart: w.weekStart, hours: round2(w.hours), gross: round2(w.gross), hasNoRate: w.hasNoRate }))
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
  };
}
