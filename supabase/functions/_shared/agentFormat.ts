// AVEN_MERGE_ARC B6.1 Slice 1 — shared money formatting for the agents.
// fmtMoney was duplicated identically in both fns. amountToWords is the VOICE_AGENT money-safety
// read-back (digit + spelled-out on money confirm cards so a misheard/fat-fingered amount surfaces
// before the row writes) — used by the master surface today; the field surface adopts it in Slice 4.
// Ported from the retired src/lib/labelParser.js.

export function fmtMoney(n: unknown): string {
  return `$${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const _ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const _TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const _TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function _under1000(n: number): string {
  let out = "";
  if (n >= 100) {
    out += _ONES[Math.floor(n / 100)] + " hundred";
    n %= 100;
    if (n > 0) out += " ";
  }
  if (n >= 20) {
    out += _TENS[Math.floor(n / 10)];
    if (n % 10 > 0) out += "-" + _ONES[n % 10];
  } else if (n >= 10) {
    out += _TEENS[n - 10];
  } else if (n > 0) {
    out += _ONES[n];
  }
  return out;
}

export function amountToWords(amt: unknown): string {
  const num = Number(amt);
  if (amt == null || Number.isNaN(num)) return "";
  const n = Math.floor(Math.abs(num));
  const cents = Math.round((Math.abs(num) - n) * 100);
  if (n === 0 && cents === 0) return "zero dollars";
  const parts: string[] = [];
  if (n >= 1_000_000) parts.push(_under1000(Math.floor(n / 1_000_000)) + " million");
  if ((n % 1_000_000) >= 1_000) parts.push(_under1000(Math.floor((n % 1_000_000) / 1_000)) + " thousand");
  if (n % 1_000 > 0) parts.push(_under1000(n % 1_000));
  let words = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!words) words = "zero";
  words += n === 1 ? " dollar" : " dollars";
  if (cents > 0) words += " and " + (cents < 10 ? "oh " : "") + _under1000(cents) + (cents === 1 ? " cent" : " cents");
  return words;
}
