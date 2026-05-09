// labelParser — regex + keyword extraction for MasterAgent quick-capture labels.
// Pure JS, no LLM call. Each parser returns null for fields it can't extract;
// never throws, never partial-fills incorrectly. Output field names match the
// JS write helpers (sbCreateTransaction / sbCreateUserTodo / sbSaveJob /
// sbCreateChangeOrder) so smart-Resume can pre-fill state without translation.

const NOISE_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'to', 'at', 'on', 'in', 'of', 'with',
  'from', 'by', 'about', 'is', 'was', 'be', 'this', 'that', 'these', 'those',
  'add', 'new', 'todo', 'task', 'note', 'lead', 'receipt', 'co', 'change',
  'order', 'extra', 'job', 'project',
]);

const STREET_TYPES = [
  'street', 'st', 'rd', 'road', 'ave', 'avenue', 'drive', 'dr', 'ln', 'lane',
  'ct', 'court', 'way', 'blvd', 'boulevard', 'hwy', 'highway', 'pkwy', 'parkway',
  'pl', 'place', 'ter', 'terrace', 'cir', 'circle',
];

// ─── shared helpers ─────────────────────────────────────────────────────────

function extractAmount(label) {
  if (!label) return null;
  const matches = [...label.matchAll(/\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g)];
  if (matches.length === 0) return null;
  const nums = matches
    .map(m => parseFloat(m[1].replace(/,/g, '')))
    .filter(n => !Number.isNaN(n) && n > 0);
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

function extractPhone(label) {
  if (!label) return null;
  const m = label.match(/(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
  if (!m) return null;
  // Normalize digits only.
  const digits = m[2].replace(/\D/g, '');
  if (digits.length !== 10) return null;
  return digits;
}

function extractAddress(label) {
  if (!label) return null;
  const streetTypeAlt = STREET_TYPES.join('|');
  // House number + 1-4 word street name + street type. Optional trailing "city ST zip".
  const re = new RegExp(
    `\\b(\\d{1,5}\\s+(?:[A-Za-z0-9'.-]+\\s+){1,4}(?:${streetTypeAlt})\\b\\.?(?:\\s+[A-Za-z][A-Za-z'.-]*){0,3}(?:\\s+[A-Z]{2})?(?:\\s+\\d{5}(?:-\\d{4})?)?)`,
    'i'
  );
  const m = label.match(re);
  if (!m) return null;
  return m[1].trim();
}

function stripNoise(label) {
  return label.replace(/\$\s*\d[\d,.]*/g, ' ')
    .replace(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function capitalizedRuns(label) {
  if (!label) return [];
  // Find runs of 2-3 capitalized words (proper-noun candidates).
  const matches = [...label.matchAll(/\b([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+){0,2})\b/g)];
  return matches.map(m => m[1].trim()).filter(s => {
    const lower = s.toLowerCase();
    return !NOISE_WORDS.has(lower);
  });
}

// ─── receipt ────────────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS = {
  Materials: ['material', 'materials', 'lumber', 'drywall', 'paint', 'tile', 'concrete', 'hardware', 'electrical', 'plumbing'],
  Subcontractor: ['sub', 'subcontractor', 'crew', 'labor'],
  Permits: ['permit', 'permits', 'inspection', 'license'],
  Tools: ['tool', 'tools', 'rental', 'equipment'],
  Fuel: ['fuel', 'gas', 'gasoline', 'diesel', 'truck'],
  Office: ['office', 'supplies', 'paper', 'print'],
};

export function parseReceiptLabel(label, recentVendors = []) {
  if (!label || typeof label !== 'string') return { vendor: null, amount: null, category: null, project_hint: null };

  const amount = extractAmount(label);
  const lower = label.toLowerCase();

  // Category: keyword match.
  let category = null;
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some(w => lower.includes(w))) { category = cat; break; }
  }

  // Vendor: try recentVendors substring first; fallback to first capitalized run.
  let vendor = null;
  for (const v of recentVendors) {
    if (v && lower.includes(String(v).toLowerCase())) { vendor = v; break; }
  }
  if (!vendor) {
    const stripped = stripNoise(label);
    const runs = capitalizedRuns(stripped);
    if (runs.length > 0) vendor = runs[0];
  }

  // Project hint: residue after vendor + amount + category keyword removed.
  let residue = stripNoise(label);
  if (vendor) residue = residue.replace(new RegExp(vendor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
  if (category) {
    for (const w of CATEGORY_KEYWORDS[category]) {
      residue = residue.replace(new RegExp(`\\b${w}\\b`, 'gi'), ' ');
    }
  }
  residue = residue.replace(/\s+/g, ' ').trim();
  // Strip very common words.
  const tokens = residue.split(/\s+/).filter(t => t && !NOISE_WORDS.has(t.toLowerCase()));
  const project_hint = tokens.length > 0 ? tokens.join(' ') : null;

  return { vendor, amount, category, project_hint };
}

// ─── todo ───────────────────────────────────────────────────────────────────

const DUE_KEYWORDS = {
  today: ['today'],
  tomorrow: ['tomorrow'],
  this_week: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'this week', 'next week'],
};

export function parseTodoLabel(label) {
  if (!label || typeof label !== 'string') return { title: null, due_hint: null, project_hint: null };

  const lower = label.toLowerCase();

  // Due hint: keyword scan.
  let due_hint = null;
  for (const [hint, words] of Object.entries(DUE_KEYWORDS)) {
    if (words.some(w => lower.includes(w))) { due_hint = hint; break; }
  }

  // Project hint: capitalized 2-3 word runs that look address-y.
  const addr = extractAddress(label);
  const project_hint = addr || (capitalizedRuns(label).find(r => /\d/.test(r)) || null);

  // Title: full label trimmed (parser doesn't truncate; UI keeps it as the source of truth).
  const title = label.trim() || null;

  return { title, due_hint, project_hint };
}

// ─── lead ───────────────────────────────────────────────────────────────────

const LEAD_SOURCES = {
  door_knock: ['door knock', 'doorknock', 'door-knock', 'door knocked'],
  referral: ['referral', 'referred', 'refer'],
  website: ['website', 'web', 'online', 'form'],
  sign: ['sign', 'yard sign'],
  phone_in: ['phone-in', 'phone in', 'cold call', 'called in', 'inbound'],
  walk_in: ['walk-in', 'walk in'],
};

export function parseLeadLabel(label) {
  if (!label || typeof label !== 'string') return { customer_name: null, phone: null, address: null, source: null };

  const phone = extractPhone(label);
  const address = extractAddress(label);
  const lower = label.toLowerCase();

  let source = null;
  for (const [id, words] of Object.entries(LEAD_SOURCES)) {
    if (words.some(w => lower.includes(w))) { source = id; break; }
  }

  // Customer name: capitalized runs that are NOT in the address. Take the first
  // 2-3-word run that doesn't contain digits and isn't a street type.
  let customer_name = null;
  const addrLower = (address || '').toLowerCase();
  const runs = capitalizedRuns(label);
  for (const run of runs) {
    if (/\d/.test(run)) continue;
    const runLower = run.toLowerCase();
    if (addrLower && addrLower.includes(runLower)) continue;
    if (STREET_TYPES.some(t => runLower.endsWith(t))) continue;
    customer_name = run;
    break;
  }

  return { customer_name, phone, address, source };
}

// ─── change order ──────────────────────────────────────────────────────────

export function parseCOLabel(label) {
  if (!label || typeof label !== 'string') return { title: null, description: null, amount: null, project_hint: null };

  const amount = extractAmount(label);

  // Title: the segment before the first money/anchor token.
  const moneyIdx = label.search(/\$|\bfor\s+\$|\bat\s+\$/i);
  const dashIdx = (() => {
    const m = label.match(/[-–—]/);
    return m ? m.index : -1;
  })();
  let titleEnd = label.length;
  if (moneyIdx >= 0) titleEnd = Math.min(titleEnd, moneyIdx);
  if (dashIdx >= 0) titleEnd = Math.min(titleEnd, dashIdx);

  // Project hint: addresses are the strongest signal.
  const addr = extractAddress(label);

  let titleRaw = label.slice(0, titleEnd).trim();
  // Strip trailing "for"/"at"/"to" anchors.
  titleRaw = titleRaw.replace(/\s+(for|at|to)\s*$/i, '').trim();

  // If we have an address inside the title chunk, strip it from title — addresses
  // belong to project_hint.
  if (addr && titleRaw.toLowerCase().includes(addr.toLowerCase())) {
    titleRaw = titleRaw.replace(new RegExp(addr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ').replace(/\s+/g, ' ').trim();
  }

  // Description: the bit between title end and amount, if any. Falls back to whole label.
  let description = null;
  if (moneyIdx > titleEnd) {
    description = label.slice(titleEnd, moneyIdx).replace(/^[-–—\s]+|\s+$/g, '').trim() || null;
  }
  if (!description) description = titleRaw || null;

  // Project hint precedence: address > capitalized job-name run.
  let project_hint = addr;
  if (!project_hint) {
    const runs = capitalizedRuns(label);
    project_hint = runs.find(r => !/\d/.test(r)) || null;
  }

  // If title is empty after stripping, fall back to the full pre-money slice.
  const title = titleRaw || (label.slice(0, moneyIdx >= 0 ? moneyIdx : label.length).trim() || null);

  return { title, description, amount, project_hint };
}

// ─── project hint matching ──────────────────────────────────────────────────

/**
 * Substring-match a project_hint against a list of jobs. Returns the matched
 * job(s) — caller decides whether 1 match auto-prefills or 0/many shows a picker.
 */
export function matchProjectHint(hint, jobs) {
  if (!hint || !Array.isArray(jobs) || jobs.length === 0) return [];
  const needle = String(hint).toLowerCase().trim();
  if (needle.length < 2) return [];
  return jobs.filter(j => {
    const hay = String(j.address || '').toLowerCase();
    return hay.includes(needle) || needle.split(/\s+/).some(tok => tok.length >= 3 && hay.includes(tok));
  });
}

// ─── currency words (money-safety read-back for CO confirm) ────────────────

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function under1000(n) {
  let out = '';
  if (n >= 100) {
    out += ONES[Math.floor(n / 100)] + ' hundred';
    n %= 100;
    if (n > 0) out += ' ';
  }
  if (n >= 20) {
    out += TENS[Math.floor(n / 10)];
    if (n % 10 > 0) out += '-' + ONES[n % 10];
  } else if (n >= 10) {
    out += TEENS[n - 10];
  } else if (n > 0) {
    out += ONES[n];
  }
  return out;
}

export function amountToWords(amt) {
  if (amt == null || Number.isNaN(amt)) return '';
  const n = Math.floor(Math.abs(amt));
  const cents = Math.round((Math.abs(amt) - n) * 100);
  if (n === 0 && cents === 0) return 'zero dollars';
  const parts = [];
  if (n >= 1_000_000) {
    parts.push(under1000(Math.floor(n / 1_000_000)) + ' million');
  }
  if ((n % 1_000_000) >= 1_000) {
    parts.push(under1000(Math.floor((n % 1_000_000) / 1_000)) + ' thousand');
  }
  if (n % 1_000 > 0) {
    parts.push(under1000(n % 1_000));
  }
  let words = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!words) words = 'zero';
  words += n === 1 ? ' dollar' : ' dollars';
  if (cents > 0) words += ' and ' + (cents < 10 ? 'oh ' : '') + under1000(cents) + (cents === 1 ? ' cent' : ' cents');
  return words;
}
