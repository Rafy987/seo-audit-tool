// Simple in-memory rate limiting to protect the free PageSpeed and Groq quotas.
// Honest limit: on Vercel each server instance counts separately, so the real
// limit can be a bit higher than these numbers. Good enough for a free tool;
// a shared store (e.g. Upstash Redis) would make it exact.

export type LimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private limit: number,
    private windowMs: number,
    private now: () => number = Date.now, // injectable for tests
  ) {}

  // Records a hit for `key` if it's under the limit.
  check(key: string): LimitResult {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((h) => h > t - this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      const retryAfterSec = Math.max(1, Math.ceil((recent[0] + this.windowMs - t) / 1000));
      return { ok: false, retryAfterSec };
    }
    recent.push(t);
    this.hits.set(key, recent);
    // Keep memory small: drop keys with no recent hits now and then.
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (!v.some((h) => h > t - this.windowMs)) this.hits.delete(k);
    }
    return { ok: true };
  }
}

// The visitor's IP from Vercel's / proxies' headers (first address in the list).
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

// "23 minutes" / "40 seconds" for the error message.
export function waitText(sec: number): string {
  if (sec < 60) return `${sec} second${sec === 1 ? "" : "s"}`;
  const min = Math.ceil(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  const h = Math.ceil(min / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Per visitor (IP) per hour, plus a daily cap for the whole app to stay
// inside the free API quotas.
export const limits = {
  auditPerIp: new RateLimiter(10, HOUR),
  speedPerIp: new RateLimiter(15, HOUR),
  reportPerIp: new RateLimiter(20, HOUR),
  speedDaily: new RateLimiter(400, DAY), // PageSpeed free quota is much higher; this is a safety net
  reportDaily: new RateLimiter(300, DAY), // each report is 1-2 Groq calls
};

// A 429 JSON response with a friendly message and a Retry-After header.
export function tooMany(what: string, retryAfterSec: number): Response {
  return Response.json(
    { error: `You've reached the limit for ${what}. Please try again in ${waitText(retryAfterSec)}.`, retryAfterSec },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
