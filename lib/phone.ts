// One phone parser for the whole app (lead capture, NAP, ...).
// Supports US numbers plus international formats (Pakistan, UK, "+country" numbers).

export type Phone = {
  key: string; // used to compare: last 10 digits, so "+92 310..." and "0310..." match
  display: string; // how we show it to the user
};

// Patterns for phone numbers written in page text. Kept strict so prices,
// years and product codes aren't mistaken for phone numbers.
const TEXT_PATTERNS = [
  // US: (214) 555-1234, 214-555-1234, +1 214.555.1234
  /(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g,
  // International with + or 00: +92 310 5521893, +44 20 7946 0958, 0044 20 7946 0958
  /(?:\+|\b00)[1-9]\d{0,2}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,8}){1,4}\b/g,
  // Pakistan mobile: 0310-5521893, 0310 5521893, 03105521893
  /\b03\d{2}[\s-]?\d{7}\b/g,
  // National numbers with a leading 0 (UK, PK landlines...): 020 7946 0958, 042-35761234
  /\b0\d{2,4}[\s.-]\d{3,4}[\s.-]?\d{3,4}\b/g,
];

// Returns a Phone, or null if it isn't a believable phone number.
export function parsePhone(raw: string): Phone | null {
  const text = raw.trim().replace(/\s+/g, " ");
  let digits = text.replace(/\D/g, "");
  if (text.startsWith("00")) digits = digits.slice(2); // 0044... -> 44...
  if (digits.length < 9 || digits.length > 15) return null; // E.164 allows max 15 digits
  if (/^(\d)\1+$/.test(digits)) return null; // 0000000000

  const key = digits.length > 10 ? digits.slice(-10) : digits;

  // US numbers (10 digits not starting with 0, or +1 / 1 + 10 digits)
  // get the familiar (214) 555-1234 format.
  const isUs =
    (digits.length === 10 && !text.startsWith("0") && !text.startsWith("+")) ||
    (digits.length === 11 && digits.startsWith("1") && /^\+?1(?:[\s.(-]|\d{10}$)/.test(text));
  if (isUs) {
    const d = digits.slice(-10);
    return { key, display: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` };
  }
  return { key, display: text.replace(/[,;.]$/, "") };
}

// All phone numbers in a block of text (deduplicated by key).
export function findPhonesInText(text: string): Phone[] {
  const found = new Map<string, Phone>();
  for (const re of TEXT_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const p = parsePhone(m[0]);
      if (p && !found.has(p.key)) found.set(p.key, p);
    }
  }
  return [...found.values()];
}

// Numbers in a tel: link. Some sites put several in one link:
// "tel:0310-5521893, 0336-5033448" -> 2 numbers.
export function parseTelHref(href: string): Phone[] {
  let value = href.replace(/^tel:/i, "");
  try {
    value = decodeURIComponent(value);
  } catch {
    // keep as is
  }
  return value
    .split(/[,;/]|\s{2,}|\bor\b/i)
    .map((part) => parsePhone(part.replace(/[^\d+().\s-]/g, "")))
    .filter((p): p is Phone => p !== null);
}
