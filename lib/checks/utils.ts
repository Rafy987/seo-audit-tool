// Small helpers shared by the check files.

// Collapse whitespace and trim. Safe on undefined.
export const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

// US phone numbers written with separators: (214) 555-1234, 214-555-1234, +1 214.555.1234
export const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/;
export const PHONE_RE_ALL = new RegExp(PHONE_RE.source, "g");

// "+1 (925) 330-8550" -> "9253308550". Returns null if it isn't a 10-digit US number.
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length === 10 ? digits : null;
}

// "9253308550" -> "(925) 330-8550"
export const formatPhone = (d: string) => `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;

// Same website? Ignores "www." and letter case.
export function sameSite(a: string, b: string): boolean {
  const strip = (h: string) => h.toLowerCase().replace(/^www\./, "");
  return strip(a) === strip(b);
}
