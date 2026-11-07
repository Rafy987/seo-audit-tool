import { lookup } from "node:dns/promises";
import net from "node:net";
import { normalizeUrl } from "./url";

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB
const MAX_REDIRECTS = 5;
const USER_AGENT =
  "Mozilla/5.0 (compatible; LeadLeakBot/1.0; +https://github.com/Rafy987/seo-audit-tool)";

export type FetchedPage = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  html: string;
  bytes: number;
  loadMs: number;
  redirects: number;
};

// An error with a message that is safe to show the user.
export class FetchPageError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// True for loopback, private, link-local and other non-public addresses.
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local / cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // multicast + reserved
    );
  }
  if (net.isIPv6(ip)) {
    const v6 = ip.toLowerCase();
    if (v6 === "::" || v6 === "::1") return true;
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
  }
  return true; // not a valid IP -> treat as unsafe
}

// Resolve the hostname and refuse if any of its IPs is private.
async function assertPublicHost(hostname: string) {
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new FetchPageError("We couldn't find that website. Check the spelling of the domain.");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new FetchPageError("That address points to a private network and can't be audited.");
  }
}

// Read the body but stop once it goes over MAX_BYTES.
async function readLimited(res: Response): Promise<{ text: string; bytes: number }> {
  if (!res.body) return { text: "", bytes: 0 };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      await reader.cancel();
      throw new FetchPageError("This page is too large to audit (over 3 MB of HTML).", 413);
    }
    chunks.push(value);
  }
  return { text: new TextDecoder().decode(Buffer.concat(chunks)), bytes };
}

export async function fetchPage(input: string): Promise<FetchedPage> {
  const normalized = normalizeUrl(input);
  if (!normalized.ok) throw new FetchPageError(normalized.error);

  const requestedUrl = normalized.url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();

  try {
    let currentUrl = requestedUrl;

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      // Every hop (including redirects) is checked again.
      const check = normalizeUrl(currentUrl);
      if (!check.ok) throw new FetchPageError("The site redirected to an address we can't audit.");
      await assertPublicHost(new URL(check.url).hostname);

      const res = await fetch(check.url, {
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      // Redirect: follow it ourselves so we can check the new host.
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new FetchPageError("The site sent a broken redirect.", 502);
        currentUrl = new URL(location, check.url).toString();
        continue;
      }

      if (res.status === 401 || res.status === 403 || res.status === 429) {
        throw new FetchPageError(
          "This site blocked our scanner. Some hosts and firewalls refuse automated visits.",
          502,
        );
      }
      if (res.status >= 400) {
        throw new FetchPageError(`The site responded with an error (HTTP ${res.status}).`, 502);
      }

      const type = res.headers.get("content-type") ?? "";
      if (type && !type.includes("html")) {
        throw new FetchPageError("That address isn't a web page (it returned a file instead).", 415);
      }

      const { text, bytes } = await readLimited(res);
      return {
        requestedUrl,
        finalUrl: check.url,
        status: res.status,
        html: text,
        bytes,
        loadMs: Date.now() - started,
        redirects,
      };
    }

    throw new FetchPageError("The site redirected too many times.", 502);
  } catch (err) {
    if (err instanceof FetchPageError) throw err;
    if (controller.signal.aborted) {
      throw new FetchPageError("The site took too long to respond (over 10 seconds).", 504);
    }
    throw new FetchPageError("We couldn't connect to that website. It may be down or blocking us.", 502);
  } finally {
    clearTimeout(timer);
  }
}
