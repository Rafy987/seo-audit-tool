import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { CheckResult } from "./types";

// Each check is a pure function: (parsed HTML) -> CheckResult. No network.

function result(r: Omit<CheckResult, "category">): CheckResult {
  return { category: "on-page", ...r };
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

export function checkTitle($: CheerioAPI): CheckResult {
  const title = clean($("head title").first().text() || $("title").first().text());
  const base = { id: "title", title: "Page title", weight: 8, value: title || undefined };

  if (!title) {
    return result({ ...base, status: "error", message: "The page has no title. Google shows the title as the blue link in search results, so it's a big missed chance to get clicks." });
  }
  if (title.length < 30) {
    return result({ ...base, status: "warning", message: `The title is only ${title.length} characters. Add your main service and city, e.g. "Roof Repair in Dallas, TX | ABC Roofing".` });
  }
  if (title.length > 60) {
    return result({ ...base, status: "warning", message: `The title is ${title.length} characters, so Google will cut it off. Keep it under 60 with the service and city first.` });
  }
  return result({ ...base, status: "passed", message: `Good title length (${title.length} characters).` });
}

export function checkMetaDescription($: CheerioAPI): CheckResult {
  const desc = clean($('meta[name="description" i]').attr("content"));
  const base = { id: "meta-description", title: "Meta description", weight: 5, value: desc || undefined };

  if (!desc) {
    return result({ ...base, status: "warning", message: "No meta description. Google will pick random text from the page for your search snippet instead of a sales message." });
  }
  if (desc.length < 70 || desc.length > 160) {
    return result({ ...base, status: "notice", message: `The meta description is ${desc.length} characters. Aim for 70–160 and mention your service area and a reason to call.` });
  }
  return result({ ...base, status: "passed", message: `Good meta description length (${desc.length} characters).` });
}

export function checkH1($: CheerioAPI): CheckResult {
  const h1s = $("h1").map((_, el) => clean($(el).text())).get().filter(Boolean);
  const base = { id: "h1", title: "H1 heading", weight: 6, value: h1s.join(" | ") || undefined };

  if (h1s.length === 0) {
    return result({ ...base, status: "error", message: "No H1 heading. Google and visitors can't quickly tell what service this page is about." });
  }
  if (h1s.length > 1) {
    return result({ ...base, status: "warning", message: `There are ${h1s.length} H1 headings. Use one main H1 that names the service and city.` });
  }
  return result({ ...base, status: "passed", message: "One clear H1 heading." });
}

export function checkH2($: CheerioAPI): CheckResult {
  const count = $("h2").length;
  const base = { id: "h2", title: "H2 subheadings", weight: 2, value: String(count) };

  if (count === 0) {
    return result({ ...base, status: "notice", message: "No H2 subheadings. Break the page into sections like \"Our Services\", \"Areas We Serve\" and \"Why Choose Us\"." });
  }
  return result({ ...base, status: "passed", message: `${count} H2 subheading${count === 1 ? "" : "s"} found.` });
}

export function checkImageAlt($: CheerioAPI): CheckResult {
  const imgs = $("img");
  const missing = imgs.filter((_, el) => !clean($(el).attr("alt"))).length;
  const base = { id: "img-alt", title: "Image alt text", weight: 4, value: `${missing} of ${imgs.length} missing` };

  if (imgs.length === 0) {
    return result({ ...base, status: "notice", value: "0 images", message: "No images found. Photos of real projects build trust and can rank in Google Images." });
  }
  if (missing > 0) {
    return result({ ...base, status: "warning", message: `${missing} of ${imgs.length} images have no alt text. Describe each photo, e.g. "New shingle roof installed in Plano, TX".` });
  }
  return result({ ...base, status: "passed", message: `All ${imgs.length} images have alt text.` });
}

export function checkCanonical($: CheerioAPI, pageUrl: string): CheckResult {
  const href = clean($('link[rel="canonical" i]').attr("href"));
  const base = { id: "canonical", title: "Canonical tag", weight: 2, value: href || undefined };

  if (!href) {
    return result({ ...base, status: "notice", message: "No canonical tag. Adding one tells Google which version of the page is the main one." });
  }
  try {
    const canon = new URL(href, pageUrl);
    if (sameSite(canon.hostname, new URL(pageUrl).hostname)) {
      return result({ ...base, status: "passed", message: "Canonical tag is set." });
    }
    return result({ ...base, status: "warning", message: `The canonical tag points to another domain (${canon.hostname}), which tells Google to rank that site instead.` });
  } catch {
    return result({ ...base, status: "warning", message: "The canonical tag has an invalid URL." });
  }
}

export function checkRobotsMeta($: CheerioAPI): CheckResult {
  const content = $('meta[name="robots" i], meta[name="googlebot" i]')
    .map((_, el) => clean($(el).attr("content")).toLowerCase())
    .get()
    .join(",");
  const base = { id: "robots-meta", title: "Indexing (robots meta)", weight: 10, value: content || undefined };

  if (/\bnoindex\b|\bnone\b/.test(content)) {
    return result({ ...base, status: "error", message: "This page tells Google NOT to show it in search results (noindex). Remove it unless this is on purpose." });
  }
  return result({ ...base, status: "passed", message: "Google is allowed to show this page in search results." });
}

export function checkOpenGraph($: CheerioAPI): CheckResult {
  const has = (p: string) => !!clean($(`meta[property="${p}"]`).attr("content"));
  const missing = ["og:title", "og:image"].filter((p) => !has(p));
  const base = { id: "open-graph", title: "Social sharing preview", weight: 2, value: missing.length ? `missing ${missing.join(", ")}` : undefined };

  if (missing.length > 0) {
    return result({ ...base, status: "notice", message: `Missing ${missing.join(" and ")}. When someone shares your site on Facebook or in a text, it won't show a proper title and photo.` });
  }
  return result({ ...base, status: "passed", message: "Open Graph title and image are set." });
}

export function countWords($: CheerioAPI): number {
  const body = $("body").clone();
  body.find("script, style, noscript, template, svg").remove();
  const text = clean(body.text());
  return text ? text.split(" ").filter((w) => /[a-z0-9]/i.test(w)).length : 0;
}

export function checkWordCount($: CheerioAPI): CheckResult {
  const words = countWords($);
  const base = { id: "word-count", title: "Amount of text", weight: 4, value: `${words} words` };

  if (words < 300) {
    return result({ ...base, status: "warning", message: `Only ${words} words on the page. Google needs more text to understand your services and the cities you work in. Aim for 300+.` });
  }
  return result({ ...base, status: "passed", message: `${words} words on the page.` });
}

function sameSite(a: string, b: string): boolean {
  const strip = (h: string) => h.toLowerCase().replace(/^www\./, "");
  return strip(a) === strip(b);
}

export function countLinks($: CheerioAPI, pageUrl: string): { internal: number; external: number } {
  const host = new URL(pageUrl).hostname;
  let internal = 0;
  let external = 0;
  $("a[href]").each((_, el) => {
    const href = clean($(el).attr("href"));
    if (!href || href.startsWith("#") || /^(mailto|tel|sms|javascript):/i.test(href)) return;
    try {
      const url = new URL(href, pageUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      if (sameSite(url.hostname, host)) internal++;
      else external++;
    } catch {
      // ignore broken hrefs
    }
  });
  return { internal, external };
}

export function checkLinks($: CheerioAPI, pageUrl: string): CheckResult {
  const { internal, external } = countLinks($, pageUrl);
  const base = { id: "links", title: "Internal links", weight: 3, value: `${internal} internal, ${external} external` };

  if (internal === 0) {
    return result({ ...base, status: "warning", message: "No links to other pages on your site. Visitors (and Google) can't easily find your service and contact pages." });
  }
  return result({ ...base, status: "passed", message: `${internal} internal and ${external} external links.` });
}

// Runs every on-page check on one page.
export function runOnPageChecks(html: string, pageUrl: string): CheckResult[] {
  const $ = cheerio.load(html);
  return [
    checkRobotsMeta($),
    checkTitle($),
    checkMetaDescription($),
    checkH1($),
    checkH2($),
    checkWordCount($),
    checkImageAlt($),
    checkLinks($, pageUrl),
    checkCanonical($, pageUrl),
    checkOpenGraph($),
  ];
}
