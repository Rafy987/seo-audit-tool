import { describe, expect, it } from "vitest";
import { extractLinks, isAllowed, normalizeInternalUrl, pageScore, parseRobots, parseSitemap } from "./crawl";

const BASE = "https://abcflooring.com/";

describe("parseRobots", () => {
  it("reads Disallow rules for * and Sitemap lines", () => {
    const txt = `
User-agent: Googlebot
Disallow: /only-google

User-agent: *
Disallow: /wp-admin/   # admin
Disallow:
Sitemap: https://abcflooring.com/sitemap_index.xml`;
    expect(parseRobots(txt)).toEqual({ disallow: ["/wp-admin/"], sitemaps: ["https://abcflooring.com/sitemap_index.xml"] });
  });
});

describe("isAllowed", () => {
  it("handles prefixes, * and $", () => {
    expect(isAllowed("/wp-admin/x", ["/wp-admin/"])).toBe(false);
    expect(isAllowed("/services", ["/wp-admin/"])).toBe(true);
    expect(isAllowed("/files/a.pdf", ["/*.pdf$"])).toBe(false);
    expect(isAllowed("/a.pdf.html", ["/*.pdf$"])).toBe(true);
  });
});

describe("parseSitemap", () => {
  it("splits page URLs and child sitemaps", () => {
    const index = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://abcflooring.com/page-sitemap.xml</loc></sitemap></sitemapindex>`;
    const urlset = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc> https://abcflooring.com/hardwood </loc></url><url><loc>https://abcflooring.com/contact</loc></url></urlset>`;
    expect(parseSitemap(index)).toEqual({ urls: [], sitemaps: ["https://abcflooring.com/page-sitemap.xml"] });
    expect(parseSitemap(urlset).urls).toEqual(["https://abcflooring.com/hardwood", "https://abcflooring.com/contact"]);
  });
});

describe("normalizeInternalUrl", () => {
  it("cleans internal URLs and skips files, other sites and admin pages", () => {
    expect(normalizeInternalUrl("/hardwood/?utm_source=x#top", BASE)).toBe("https://abcflooring.com/hardwood");
    expect(normalizeInternalUrl("https://www.abcflooring.com/tile", BASE)).toBe("https://www.abcflooring.com/tile");
    expect(normalizeInternalUrl("/?page_id=12", BASE)).toBe("https://abcflooring.com/?page_id=12");
    expect(normalizeInternalUrl("https://facebook.com/abc", BASE)).toBeNull();
    expect(normalizeInternalUrl("/uploads/floor.jpg", BASE)).toBeNull();
    expect(normalizeInternalUrl("/wp-admin/", BASE)).toBeNull();
    expect(normalizeInternalUrl("tel:4085550123", BASE)).toBeNull();
  });
});

describe("extractLinks", () => {
  it("returns unique internal links", () => {
    const html = '<a href="/a">A</a><a href="/a/">A again</a><a href="https://x.com">X</a>';
    expect(extractLinks(html, BASE)).toEqual(["https://abcflooring.com/a"]);
  });
});

describe("pageScore", () => {
  it("puts contact and service pages before blog posts", () => {
    const urls = ["blog/2024/05/tips", "about", "hardwood-flooring", "contact"].map((p) => BASE + p);
    const order = urls.sort((a, b) => pageScore(b) - pageScore(a)).map((u) => new URL(u).pathname);
    expect(order).toEqual(["/contact", "/hardwood-flooring", "/about", "/blog/2024/05/tips"]);
  });
});
