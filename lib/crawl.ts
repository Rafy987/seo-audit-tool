import * as cheerio from "cheerio";
import { fetchPage } from "./fetchPage";
import { sameSite } from "./checks/utils";
import type { SitePage } from "./checks/localSeo";

// Mini crawl: robots.txt + sitemap.xml + homepage links -> up to 20 pages.
// Every request goes through fetchPage (timeouts, size limit, private IP block).

const MAX_PAGES = 20; // including the homepage
const CONCURRENCY = 4;
const BUDGET_MS = 25_000; // whole crawl, to stay inside Vercel's time limit
const MAX_SITEMAP_URLS = 1000;
const MAX_CHILD_SITEMAPS = 4;

export type CrawlResult = {
  pages: SitePage[]; // pages[0] = homepage
  urls: string[]; // all internal URLs found (sitemap + links)
  sitemapFound: boolean;
  failed: number;
};

/* ---------- Pure helpers (tested) ---------- */

// Disallow rules for "*" or our bot, and Sitemap: lines.
export function parseRobots(txt: string): { disallow: string[]; sitemaps: string[] } {
  const disallow: string[] = [];
  const sitemaps: string[] = [];
  let agents: string[] = [];
  let lastWasAgent = false;

  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();

    if (key === "user-agent") {
      agents = lastWasAgent ? [...agents, val.toLowerCase()] : [val.toLowerCase()];
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "sitemap" && val) sitemaps.push(val);
    if (key === "disallow" && val && agents.some((a) => a === "*" || a.includes("leadleakbot"))) {
      disallow.push(val);
    }
  }
  return { disallow, sitemaps };
}

// Robots rules support * (anything) and $ (end of path).
export function isAllowed(path: string, disallow: string[]): boolean {
  return !disallow.some((rule) => {
    const pattern = rule.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${pattern}`).test(path);
  });
}

// <loc> entries of a sitemap, split into page URLs and child sitemaps.
export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const $ = cheerio.load(xml, { xml: true });
  const locs = (sel: string) => $(sel).map((_, el) => $(el).text().trim()).get().filter(Boolean);
  return { urls: locs("url > loc"), sitemaps: locs("sitemap > loc") };
}

const SKIP_EXT_RE = /\.(jpe?g|png|gif|webp|avif|svg|ico|pdf|zip|mp4|mov|mp3|docx?|xlsx?|pptx?|css|js|json|xml|txt|gz)$/i;
const SKIP_PATH_RE = /\/(wp-admin|wp-login|wp-json|feed|cart|checkout|my-account|account|login|tag|author)(\/|$)|\/page\/\d+/i;

// Clean an internal URL (no #hash, no trailing slash), or null if we should skip it.
export function normalizeInternalUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!sameSite(url.hostname, new URL(base).hostname)) return null;
    if (SKIP_EXT_RE.test(url.pathname) || SKIP_PATH_RE.test(url.pathname)) return null;
    url.hash = "";
    // Drop tracking/query params, but keep WordPress "?page_id=12" style page URLs.
    if (!/^\?(page_id|p)=\d+$/.test(url.search)) url.search = "";
    let s = url.toString();
    if (s.endsWith("/") && url.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

export function extractLinks(html: string, base: string): string[] {
  const $ = cheerio.load(html);
  const out = new Set<string>();
  $("a[href]").each((_, a) => {
    const u = normalizeInternalUrl($(a).attr("href") ?? "", base);
    if (u) out.add(u);
  });
  return [...out];
}

// Which pages to fetch first: contact > service/city pages > short paths. Blog last.
export function pageScore(u: string): number {
  const path = new URL(u).pathname.toLowerCase();
  let score = 0;
  if (/contact|quote|estimate/.test(path)) score += 100;
  if (/service|area|location|cit(y|ies)|serving/.test(path)) score += 60;
  if (/floor|roof|plumb|hvac|paint|remodel|kitchen|bath|repair|install|deck|fenc|concrete|siding|window|gutter|tile|carpet|hardwood/.test(path)) score += 50;
  if (/about/.test(path)) score += 30;
  if (/blog|news|\d{4}\/\d{2}/.test(path)) score -= 80;
  return score - path.split("/").length * 5;
}

/* ---------- Network ---------- */

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  try {
    return (await fetchPage(url, { accept: "text", timeoutMs })).html;
  } catch {
    return null;
  }
}

async function findSitemapUrls(origin: string, robotsSitemaps: string[], deadline: number) {
  const candidates = [...new Set([...robotsSitemaps, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`])];

  for (const candidate of candidates) {
    if (Date.now() > deadline - 3000) break;
    const xml = await fetchText(candidate, 6000);
    if (!xml) continue;
    const parsed = parseSitemap(xml);
    if (parsed.urls.length === 0 && parsed.sitemaps.length === 0) continue;

    const urls = [...parsed.urls];
    // Sitemap index: open child sitemaps, page/service/location ones first.
    const children = parsed.sitemaps
      .sort((a, b) => Number(/page|service|location|area/i.test(b)) - Number(/page|service|location|area/i.test(a)))
      .slice(0, MAX_CHILD_SITEMAPS);
    const childXml = await Promise.all(children.map((c) => fetchText(c, 6000)));
    for (const x of childXml) if (x) urls.push(...parseSitemap(x).urls);

    return { found: true, urls: urls.slice(0, MAX_SITEMAP_URLS) };
  }
  return { found: false, urls: [] as string[] };
}

export async function crawlSite(home: SitePage): Promise<CrawlResult> {
  const deadline = Date.now() + BUDGET_MS;
  const origin = new URL(home.url).origin;

  const robotsTxt = (await fetchText(`${origin}/robots.txt`, 5000)) ?? "";
  // Ignore HTML error pages served at /robots.txt.
  const robots = /<html/i.test(robotsTxt) ? { disallow: [], sitemaps: [] } : parseRobots(robotsTxt);

  const sitemap = await findSitemapUrls(origin, robots.sitemaps, deadline);
  const homeKey = normalizeInternalUrl(home.url, home.url);

  const all = new Set<string>();
  for (const u of [...sitemap.urls, ...extractLinks(home.html, home.url)]) {
    const n = normalizeInternalUrl(u, home.url);
    if (n && n !== homeKey) all.add(n);
  }

  const queue = [...all]
    .filter((u) => isAllowed(new URL(u).pathname, robots.disallow))
    .sort((a, b) => pageScore(b) - pageScore(a))
    .slice(0, MAX_PAGES - 1);

  const pages: SitePage[] = [home];
  let failed = 0;

  // Simple worker pool: CONCURRENCY workers take URLs from the queue.
  async function worker() {
    while (queue.length > 0) {
      const remaining = deadline - Date.now();
      if (remaining < 1500) return;
      const url = queue.shift()!;
      try {
        const page = await fetchPage(url, { timeoutMs: Math.min(8000, remaining) });
        pages.push({ url: page.finalUrl, html: page.html });
      } catch {
        failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return { pages, urls: [...all], sitemapFound: sitemap.found, failed };
}
