/**
 * Parse construction-style length strings into decimal feet.
 * Accepts:
 *   "10"         → 10 feet
 *   "10.5"       → 10.5 feet
 *   "10'6"       → 10.5 feet
 *   "10' 6\""    → 10.5 feet
 *   "10ft 6in"   → 10.5 feet
 *   "10 6"       → 10.5 feet  (space-separated feet/inches shortcut)
 *   "6\""        → 0.5 feet
 *   "6in"        → 0.5 feet
 *
 * Returns null if unparseable.
 */
export function parseFootInches(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;

  // Pure number → feet
  if (/^[\d.]+$/.test(s)) {
    const v = parseFloat(s);
    return isNaN(v) ? null : v;
  }

  // Normalize unit words to symbols
  const cleaned = s
    .replace(/feet|foot|ft/g, "'")
    .replace(/inches|inch|in/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  // "10'6"  "10' 6"  "10'6\""
  const ftIn = cleaned.match(/^(\d+(?:\.\d+)?)\s*'\s*(\d+(?:\.\d+)?)\s*"?$/);
  if (ftIn) return parseFloat(ftIn[1]) + parseFloat(ftIn[2]) / 12;

  // "10'"
  const ftOnly = cleaned.match(/^(\d+(?:\.\d+)?)\s*'$/);
  if (ftOnly) return parseFloat(ftOnly[1]);

  // "6\""
  const inOnly = cleaned.match(/^(\d+(?:\.\d+)?)\s*"$/);
  if (inOnly) return parseFloat(inOnly[1]) / 12;

  // "10 6" → 10 feet 6 inches (inches must be < 12 to avoid ambiguity with decimals)
  const spaceSplit = cleaned.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/);
  if (spaceSplit) {
    const ft = parseFloat(spaceSplit[1]);
    const inches = parseFloat(spaceSplit[2]);
    if (inches < 12) return ft + inches / 12;
  }

  return null;
}
