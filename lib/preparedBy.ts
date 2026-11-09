// Optional "Prepared by" details for the PDF, from .env.local:
// PREPARED_BY_NAME, PREPARED_BY_EMAIL, PREPARED_BY_URL.
// These are not secrets (they're printed on the PDF), so the server passes them to the browser.

export type PreparedBy = { name?: string; email?: string; url?: string };

const clean = (v: string | undefined, max: number) => (v ?? "").trim().slice(0, max);

export function getPreparedBy(env: Record<string, string | undefined> = process.env): PreparedBy | null {
  const name = clean(env.PREPARED_BY_NAME, 80);
  const emailRaw = clean(env.PREPARED_BY_EMAIL, 120);
  const urlRaw = clean(env.PREPARED_BY_URL, 200);

  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : "";
  const url = /^https?:\/\/\S+$/i.test(urlRaw) ? urlRaw : "";

  if (!name && !email && !url) return null; // nothing set: hide the block
  return { ...(name && { name }), ...(email && { email }), ...(url && { url }) };
}
