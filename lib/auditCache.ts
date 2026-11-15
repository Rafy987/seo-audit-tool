import type { AuditBasicInfo } from "@/app/api/audit/route";
import type { AiReport } from "./aiReport";

// Browser cache of recent audits (localStorage), so running the same site again
// within 24 hours doesn't spend the free PageSpeed / Groq quota.
// Pure functions that take a Storage-like object, so they're easy to test.

export type CachedAudit = { savedAt: number; info: AuditBasicInfo; report: AiReport | null };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const KEY = "leadleak:audits:v1";
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 10;

// Same site = same key: ignore "www.", "http(s)", trailing slash and case.
export function cacheKey(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "")).toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function readAll(store: StorageLike): Record<string, CachedAudit> {
  try {
    const raw = store.getItem(KEY);
    const data = raw ? (JSON.parse(raw) as Record<string, CachedAudit>) : {};
    return typeof data === "object" && data !== null ? data : {};
  } catch {
    return {}; // private mode, blocked storage or broken JSON: behave as empty
  }
}

export function getCachedAudit(store: StorageLike, url: string, now = Date.now()): CachedAudit | null {
  const hit = readAll(store)[cacheKey(url)];
  if (!hit || typeof hit.savedAt !== "number" || now - hit.savedAt > CACHE_TTL_MS) return null;
  return hit;
}

export function saveCachedAudit(store: StorageLike, info: AuditBasicInfo, report: AiReport | null, now = Date.now()): void {
  const all = readAll(store);
  // Drop expired entries, add this one, keep only the newest MAX_ENTRIES.
  const fresh = Object.entries(all).filter(([, v]) => now - v.savedAt <= CACHE_TTL_MS);
  const next = Object.fromEntries(
    [...fresh.filter(([k]) => k !== cacheKey(info.finalUrl)), [cacheKey(info.finalUrl), { savedAt: now, info, report }] as const]
      .sort((a, b) => b[1].savedAt - a[1].savedAt)
      .slice(0, MAX_ENTRIES),
  );
  try {
    store.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full or blocked: caching is optional, so ignore
  }
}

// "just now", "5 minutes ago", "2 hours ago"
export function ageText(savedAt: number, now = Date.now()): string {
  const min = Math.floor((now - savedAt) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const h = Math.floor(min / 60);
  return `${h} hour${h === 1 ? "" : "s"} ago`;
}
