// Result type: either a clean URL, or an error message to show the user.
export type NormalizeResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Turns what the user typed ("abcflooring.com") into a full URL
 * ("https://abcflooring.com/"), or returns a friendly error.
 * Basic check only — the API route (Phase 2) will also block private IPs.
 */
export function normalizeUrl(input: string): NormalizeResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter the website address you want to audit." };
  }

  // Add https:// if the user left it out.
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return { ok: false, error: "That doesn't look like a website address. Try something like abcroofing.com" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http and https websites can be audited." };
  }

  const host = parsed.hostname.toLowerCase();

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return { ok: false, error: "Local addresses can't be audited. Use the public website address." };
  }

  // Must have a real domain ending, e.g. ".com" (raw IPs are rejected too).
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
  if (isIp || !/\.[a-z]{2,}$/.test(host)) {
    return { ok: false, error: "Enter a full domain name, like abcroofing.com" };
  }

  return { ok: true, url: parsed.toString() };
}
