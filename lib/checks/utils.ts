// Small helpers shared by the check files.

// Collapse whitespace and trim. Safe on undefined.
export const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

// Same website? Ignores "www." and letter case.
export function sameSite(a: string, b: string): boolean {
  const strip = (h: string) => h.toLowerCase().replace(/^www\./, "");
  return strip(a) === strip(b);
}
