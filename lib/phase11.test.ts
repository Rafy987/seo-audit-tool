import { describe, expect, it } from "vitest";
import { MemoryCache } from "./memoryCache";
import { clientIp, RateLimiter, waitText } from "./rateLimit";
import { ageText, CACHE_TTL_MS, cacheKey, getCachedAudit, saveCachedAudit } from "./auditCache";
import type { AuditBasicInfo } from "@/app/api/audit/route";

// A clock we control, so time-based logic is testable.
const clock = (start = 1_000_000) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};

describe("MemoryCache", () => {
  it("returns a value until it expires", () => {
    const c = clock();
    const cache = new MemoryCache<string>(1000, 10, c.now);
    cache.set("a", "x");
    expect(cache.get("a")).toBe("x");
    c.advance(999);
    expect(cache.get("a")).toBe("x");
    c.advance(2);
    expect(cache.get("a")).toBeUndefined();
  });
  it("drops the oldest entry when full", () => {
    const cache = new MemoryCache<number>(60_000, 2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });
});

describe("RateLimiter", () => {
  it("allows up to the limit, then blocks with a retry time", () => {
    const c = clock();
    const rl = new RateLimiter(2, 60_000, c.now);
    expect(rl.check("ip1").ok).toBe(true);
    expect(rl.check("ip1").ok).toBe(true);
    const third = rl.check("ip1");
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.retryAfterSec).toBe(60);
    expect(rl.check("ip2").ok).toBe(true); // other visitors aren't affected
  });
  it("lets requests through again after the window passes", () => {
    const c = clock();
    const rl = new RateLimiter(1, 60_000, c.now);
    rl.check("ip");
    expect(rl.check("ip").ok).toBe(false);
    c.advance(60_001);
    expect(rl.check("ip").ok).toBe(true);
  });
  it("reads the visitor IP from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(new Headers())).toBe("unknown");
  });
  it("writes a friendly wait time", () => {
    expect(waitText(1)).toBe("1 second");
    expect(waitText(45)).toBe("45 seconds");
    expect(waitText(61)).toBe("2 minutes");
    expect(waitText(3600)).toBe("1 hour");
  });
});

describe("browser audit cache", () => {
  // A fake localStorage.
  const fakeStore = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  };
  const info = (url: string) => ({ finalUrl: url, checks: [] }) as unknown as AuditBasicInfo;
  const report = { summary: "Your site is losing leads because...", fixes: [{ title: "Fix", detail: "So more people call." }] };

  it("treats www/http/trailing slash as the same site", () => {
    expect(cacheKey("https://www.ABCflooring.com/")).toBe(cacheKey("http://abcflooring.com"));
  });
  it("saves and returns an audit within 24 hours, not after", () => {
    const store = fakeStore();
    const t0 = 5_000_000;
    saveCachedAudit(store, info("https://abcflooring.com/"), report, t0);
    const hit = getCachedAudit(store, "https://www.abcflooring.com", t0 + 60_000); // www + no slash = same site
    expect(hit?.report).toEqual(report);
    expect(hit?.savedAt).toBe(t0);
    expect(getCachedAudit(store, "https://abcflooring.com/", t0 + CACHE_TTL_MS + 1)).toBeNull();
  });
  it("keeps only the 10 newest audits", () => {
    const store = fakeStore();
    for (let i = 0; i < 12; i++) saveCachedAudit(store, info(`https://site${i}.com/`), null, 1000 + i);
    expect(getCachedAudit(store, "https://site0.com/", 2000)).toBeNull();
    expect(getCachedAudit(store, "https://site11.com/", 2000)).not.toBeNull();
  });
  it("never throws when storage is broken or blocked", () => {
    const broken = { getItem: () => "{not json", setItem: () => { throw new Error("full"); }, removeItem: () => {} };
    expect(getCachedAudit(broken, "https://a.com", 0)).toBeNull();
    expect(() => saveCachedAudit(broken, info("https://a.com/"), null, 0)).not.toThrow();
  });
  it("shows the age in plain words", () => {
    expect(ageText(0, 30_000)).toBe("just now");
    expect(ageText(0, 5 * 60_000)).toBe("5 minutes ago");
    expect(ageText(0, 2 * 3600_000)).toBe("2 hours ago");
  });
});
