import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { CheckResult } from "./types";
import { clean } from "./utils";
import { findPhonesInText, parsePhone, parseTelHref, type Phone } from "../phone";

// Local SEO checks across several pages of one site.
// Pure functions: they get HTML + URL lists, never fetch anything.

export type SitePage = { url: string; html: string };

export type LocalSeoInput = {
  pages: SitePage[]; // pages[0] is the homepage
  urls: string[]; // every internal URL we know of (sitemap + links)
  sitemapFound: boolean;
};

function result(r: Omit<CheckResult, "category">): CheckResult {
  return { category: "local-seo", ...r };
}

/* ---------- Schema (JSON-LD) ---------- */

type JsonObject = Record<string, unknown>;
const isObj = (v: unknown): v is JsonObject => typeof v === "object" && v !== null && !Array.isArray(v);

// All JSON-LD objects on a page, with @graph and arrays flattened.
export function extractJsonLd($: CheerioAPI): JsonObject[] {
  const out: JsonObject[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!isObj(node)) return;
    if (Array.isArray(node["@graph"])) node["@graph"].forEach(visit);
    if (node["@type"]) out.push(node);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      visit(JSON.parse($(el).text()));
    } catch {
      // broken JSON-LD is ignored (Google ignores it too)
    }
  });
  return out;
}

export const typesOf = (node: JsonObject): string[] =>
  ([] as unknown[])
    .concat(node["@type"])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.replace(/^https?:\/\/schema\.org\//, ""));

const LOCAL_TYPES = new Set([
  "LocalBusiness", "HomeAndConstructionBusiness", "GeneralContractor", "RoofingContractor",
  "Plumber", "Electrician", "HVACBusiness", "HousePainter", "Locksmith", "MovingCompany",
  "ProfessionalService", "HomeGoodsStore", "FurnitureStore", "HardwareStore",
]);
export const isLocalBusinessType = (t: string) =>
  LOCAL_TYPES.has(t) || /(Contractor|Business|Plumber|Electrician|Locksmith|Painter|Store)$/.test(t);

export type BusinessInfo = {
  type: string;
  name?: string;
  telephone?: string;
  street?: string;
  city?: string;
  areaServed: string[];
  missing: string[];
};

const str = (v: unknown) => (typeof v === "string" ? clean(v) : "");
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

function names(v: unknown): string[] {
  return ([] as unknown[]).concat(v ?? []).flatMap((x) => {
    if (typeof x === "string") return [clean(x)];
    if (isObj(x)) return [str(x.name) || str(x.addressLocality)].filter(Boolean);
    return [];
  });
}

// The LocalBusiness schema of the site (homepage first, then other pages).
export function getBusinessSchema(pages: CheerioAPI[]): { business: BusinessInfo | null; hasOrganization: boolean } {
  let hasOrganization = false;
  for (const $ of pages) {
    for (const node of extractJsonLd($)) {
      const types = typesOf(node);
      if (types.includes("Organization")) hasOrganization = true;
      const type = types.find(isLocalBusinessType);
      if (!type) continue;

      const addr = first(node.address);
      const street = isObj(addr) ? str(addr.streetAddress) : str(addr);
      const city = isObj(addr) ? str(addr.addressLocality) : "";
      const areaServed = names(node.areaServed);
      const info: BusinessInfo = {
        type,
        name: str(node.name) || undefined,
        telephone: str(first(node.telephone)) || undefined,
        street: street || undefined,
        city: city || undefined,
        areaServed,
        missing: [],
      };
      if (!info.name) info.missing.push("name");
      if (!info.street && !info.city) info.missing.push("address");
      if (!info.telephone) info.missing.push("telephone");
      if (areaServed.length === 0) info.missing.push("areaServed");
      return { business: info, hasOrganization };
    }
  }
  return { business: null, hasOrganization };
}

export function checkLocalBusinessSchema(pages: CheerioAPI[]): CheckResult {
  const { business, hasOrganization } = getBusinessSchema(pages);
  const base = { id: "local-schema", title: "LocalBusiness schema", weight: 8 };

  if (!business) {
    const extra = hasOrganization ? " You have Organization schema, but it doesn't tell Google you're a local service business." : "";
    return result({ ...base, status: "error", message: `No LocalBusiness schema found. This code tells Google your business name, address, phone and the cities you serve, which helps you show up in local results.${extra}` });
  }
  if (business.missing.length > 0) {
    return result({ ...base, status: "warning", value: business.type, message: `${business.type} schema found, but it's missing: ${business.missing.join(", ")}. Fill these in so Google has your full business details.` });
  }
  return result({ ...base, status: "passed", value: business.type, message: `${business.type} schema with name, address, phone and service area.` });
}

/* ---------- Service and city pages ---------- */

const SERVICE_RE =
  /floor|hardwood|laminate|vinyl|carpet|tile|epoxy|refinish|roof|gutter|siding|window|door|deck|fenc|concrete|paving|asphalt|masonry|plumb|drain|sewer|water-heater|hvac|air-condition|heating|furnace|electric|paint|remodel|kitchen|bath|basement|landscap|lawn|tree-|pest|pool|solar|insulation|drywall|cabinet|countertop|garage|foundation|waterproof|restoration|mold|cleaning|repair|install|replace/;

const AREA_HUB_RE = /^\/(areas?|service-areas?|areas-we-serve|areas-served|locations?|cities|city|serving)\/[^/]+/;
// Last path part ends in a state code, e.g. /flooring-san-jose-ca (needs 2+ words before it).
const STATE_SUFFIX_RE =
  /[a-z]+-[a-z]+-(al|ak|az|ar|ca|co|ct|fl|ga|ia|id|il|ks|ky|la|ma|md|mi|mn|mo|ms|mt|nc|nd|ne|nh|nj|nm|nv|ny|ri|sc|sd|tn|tx|ut|va|vt|wa|wi|wv|wy)$/;
// One word + state, e.g. /orinda-ca. Only states that aren't also common words
// (so /sign-in, /contact-me, /about-us, /go-to etc. don't count).
const ONE_WORD_STATE_RE = /^[a-z]{4,}-(ak|az|ar|ca|ct|fl|ga|ia|il|ks|ky|md|mi|mn|ms|mt|nc|nd|nh|nj|nm|nv|ny|ri|sc|sd|tn|tx|ut|va|vt|wa|wi|wv|wy)$/;
const SKIP_PATH_RE = /^\/(blog|news|articles?|tag|category|author|wp-|feed)(\/|$)|\/\d{4}\/\d{2}\//;
// Shop / product URLs are never service or city pages, even if they contain a
// place name ("/yamaha/23-ybr-125-price-in-pakistan.html").
const PRODUCT_PATH_RE = /\/\d+-[a-z0-9-]+\.html?$|\/(products?|shop|product-category|collections|item|catalog)\//;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ---------- City names found on the site ---------- */

const STATE_CODES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY";
// "Castro Valley, CA" or "Oakland, CA 94612"
const CITY_STATE_RE = new RegExp(`\\b([A-Z][a-z]+(?:[ -][A-Z][a-z]+){0,2}),\\s*(?:${STATE_CODES})\\b`, "g");
// A token that looks like a place name: 1-3 capitalized words.
const PLACE_RE = /^[A-Z][a-z]+(?:[ -][A-Z][a-z]+){0,2}$/;
// Words that are never (part of) a city name in our context.
const NOT_CITY_WORDS = new Set([
  "we", "our", "the", "and", "call", "free", "estimate", "estimates", "contact", "us", "home", "more", "about",
  "learn", "today", "now", "get", "quote", "read", "click", "here", "all", "areas", "area", "serve", "serving",
  "service", "services", "surrounding", "nearby", "including", "cities", "communities", "flooring", "floors",
  "hardwood", "roofing", "plumbing", "repair", "installation", "company", "inc", "llc", "best", "top",
  "suite", "street", "st", "ave", "road", "blvd", "gallery", "reviews", "welcome",
  "your", "my", "transform", "upgrade", "new", "in", "for", "near", "visit", "local", "trusted", "premier",
  // Countries / regions are not city pages ("price in Pakistan").
  "pakistan", "usa", "america", "united", "states", "kingdom", "uk", "england", "britain", "canada", "india",
  "australia", "uae", "emirates", "world", "worldwide", "nationwide", "online", "international",
]);
// Fine inside a name ("Mountain View", "Castro Valley"), too generic on their own.
const GENERIC_PLACE_PARTS = new Set(["view", "valley", "park", "city", "beach", "hill", "hills", "creek", "point", "heights", "springs", "lake", "grove", "village"]);

// Adds the token if it looks like a city name. Returns true if it was added.
function addPlace(out: Set<string>, raw: string): boolean {
  const token = clean(raw)
    .replace(/^([a-z]+\s+)+/, "") // drop leading small words: "includes Oakland" -> "Oakland"
    .replace(/^&\s+/, "")
    .replace(/[.:]$/, "");
  if (!PLACE_RE.test(token) || token.length > 25) return false;
  const words = token.toLowerCase().split(/[ -]/);
  if (words.some((w) => NOT_CITY_WORDS.has(w))) return false;
  if (words.length === 1 && GENERIC_PLACE_PARTS.has(words[0])) return false;
  out.add(token);
  return true;
}

// Text that follows an "Areas we serve" / "Service area" phrase.
function serviceAreaTexts($: CheerioAPI): string[] {
  const texts: string[] = [];
  $("h1, h2, h3, h4, h5, h6, p, li, strong, b, span, div").each((_, el) => {
    const $el = $(el);
    const text = clean($el.text());
    const m = text.match(AREA_TEXT_RE);
    if (!m || text.length > 1500) return;

    const after = text.slice((m.index ?? 0) + m[0].length);
    if (after.length > 3) {
      texts.push(after); // e.g. "service area includes Oakland, Castro Valley, ..."
    } else {
      // A heading on its own: the list is in the next elements.
      let next = $el.nextAll().slice(0, 3);
      if (next.length === 0) next = $el.parent().nextAll().slice(0, 2);
      texts.push(clean(next.text()).slice(0, 1500));
      next.find("li, a").each((_, item) => {
        texts.push(clean($(item).text()));
      });
    }
  });
  return texts;
}

// City names the site mentions: schema, "Areas we serve" lists, and "City, ST" text.
export function extractCityNames($pages: CheerioAPI[], business: BusinessInfo | null): string[] {
  const out = new Set<string>();
  for (const c of [business?.city, ...(business?.areaServed ?? [])]) if (c) addPlace(out, c);

  for (const $ of $pages) {
    for (const text of serviceAreaTexts($)) {
      for (const part of text.split(/,|•|·|\||;|\/|\n|\s+and\s+|\s+&\s+/)) addPlace(out, part);
    }
    for (const m of visibleText($).matchAll(CITY_STATE_RE)) {
      const words = m[1].split(" ");
      if (addPlace(out, m[1]) || words.length < 2) continue;
      // "Your San Jose, CA" -> "San Jose". "Best Flooring Oakland, CA" -> "Oakland".
      // Try the last 2 words first; only fall back to the last word alone.
      if (words.length === 3 && addPlace(out, words.slice(1).join(" "))) continue;
      addPlace(out, words[words.length - 1]);
    }
  }
  return [...out];
}

/* ---------- Service / city page detection ---------- */

export type PageTitle = { url: string; title: string };

export type ClassifyOptions = {
  usStates?: boolean; // use "-ca" / "-tx" state-code URL rules (only for US sites). Default true.
  exclude?: Set<string>; // paths to skip, e.g. pages with Product schema
};

export function classifyPages(urls: string[], cities: string[] = [], titles: PageTitle[] = [], opts: ClassifyOptions = {}) {
  const { usStates = true, exclude = new Set<string>() } = opts;
  const citySlugs = cities.map(slug).filter((s) => s.length >= 4);
  // City name as a whole slug part: "castro-valley" in "castro-valley-flooring", not "oak" in "oakwood".
  const slugMatchers = citySlugs.map((c) => new RegExp(`(^|-)${escapeRe(c)}(-|$)`));

  // A city in the title of the homepage, or of most pages, is the business's home
  // town used site-wide ("... | Oakland Flooring"), so it doesn't make a city page.
  const homeTitle = titles.find((t) => new URL(t.url).pathname.replace(/\/+$/, "") === "")?.title ?? "";
  const titleCities = cities.filter((c) => {
    const re = new RegExp(`\\b${escapeRe(c)}\\b`, "i");
    if (re.test(homeTitle)) return false;
    const count = titles.filter((t) => re.test(t.title)).length;
    return titles.length < 4 || count <= titles.length / 2;
  });
  const titleByPath = new Map(
    titles.map((t) => [new URL(t.url).pathname.toLowerCase().replace(/\/+$/, ""), t.title] as const),
  );

  const service = new Set<string>();
  const city = new Set<string>();

  for (const u of [...urls, ...titles.map((t) => t.url)]) {
    let path: string;
    try {
      path = new URL(u).pathname.toLowerCase().replace(/\/+$/, "");
    } catch {
      continue;
    }
    if (!path || path === "/" || SKIP_PATH_RE.test(path) || PRODUCT_PATH_RE.test(path) || exclude.has(path)) continue;
    const last = path.split("/").pop() ?? "";
    const title = titleByPath.get(path) ?? "";

    // "-in-<city>" only counts when <city> is a city the site itself names
    // (handled by slugMatchers), so "price-in-pakistan" doesn't count.
    const isCity =
      AREA_HUB_RE.test(path) ||
      (usStates && (STATE_SUFFIX_RE.test(last) || ONE_WORD_STATE_RE.test(last))) ||
      slugMatchers.some((re) => re.test(last)) ||
      titleCities.some((c) => new RegExp(`\\b${escapeRe(c)}\\b`, "i").test(title));
    if (isCity) city.add(path);
    if (SERVICE_RE.test(last)) service.add(path);
  }
  return { service: [...service], city: [...city] };
}

export function checkServicePages(input: LocalSeoInput, cities: string[], titles: PageTitle[] = [], opts: ClassifyOptions = {}): CheckResult {
  const { service, city } = classifyPages(input.urls, cities, titles, opts);
  const base = { id: "service-city-pages", title: "Service & city pages", weight: 8, value: `${service.length} service, ${city.length} city pages` };
  const noSitemap = input.sitemapFound ? "" : " (We also couldn't find a sitemap.xml, so we only checked links from the homepage.)";

  if (service.length === 0 && city.length === 0) {
    return result({ ...base, status: "error", message: `No separate service or city pages found. With one page for everything, Google has no page to rank for searches like "hardwood flooring in San Jose".${noSitemap}` });
  }
  if (city.length === 0) {
    return result({ ...base, status: "warning", message: `${service.length} service page${service.length === 1 ? "" : "s"}, but no city/location pages. Add a page for each main town you serve so you can rank for "[service] in [city]" searches.${noSitemap}` });
  }
  if (service.length === 0) {
    return result({ ...base, status: "warning", message: `${city.length} city page${city.length === 1 ? "" : "s"}, but no separate page per service. Give each main service its own page.${noSitemap}` });
  }
  return result({ ...base, status: "passed", message: `${service.length} service and ${city.length} city/location pages found.` });
}

export function checkSitemap(input: LocalSeoInput): CheckResult {
  const base = { id: "sitemap", title: "XML sitemap", weight: 2 };
  if (!input.sitemapFound) {
    return result({ ...base, status: "notice", message: "No sitemap.xml found. A sitemap helps Google find all your service and city pages." });
  }
  return result({ ...base, status: "passed", message: "sitemap.xml found." });
}

/* ---------- NAP consistency (inside the site only) ---------- */

function visibleText($: CheerioAPI): string {
  const body = $("body").clone();
  body.find("script, style, noscript, template").remove();
  return clean(body.text());
}

// Phone numbers on a page (tel: links + text), keyed so formats don't matter.
export function phonesOnPage($: CheerioAPI): Map<string, Phone> {
  const found = new Map<string, Phone>();
  const add = (p: Phone) => {
    if (!found.has(p.key)) found.set(p.key, p);
  };
  $('a[href^="tel:" i]').each((_, a) => {
    parseTelHref($(a).attr("href") ?? "").forEach(add);
  });
  findPhonesInText(visibleText($)).forEach(add);
  return found;
}

const pathOf = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

export function checkNapConsistency(pages: SitePage[], $pages: CheerioAPI[], business: BusinessInfo | null): CheckResult {
  const base = { id: "nap", title: "Name, address & phone consistency", weight: 6 };

  // phone key -> { phone, pages it appears on }
  const where = new Map<string, { phone: Phone; pages: string[] }>();
  const pagePhones: { path: string; keys: Set<string> }[] = [];
  $pages.forEach(($, i) => {
    const path = pathOf(pages[i].url);
    const found = phonesOnPage($);
    if (found.size > 0) pagePhones.push({ path, keys: new Set(found.keys()) });
    for (const [key, phone] of found) {
      const entry = where.get(key) ?? { phone, pages: [] };
      entry.pages.push(path);
      where.set(key, entry);
    }
  });

  const schemaPhone = business?.telephone ? parsePhone(business.telephone) : null;
  if (where.size === 0 && !schemaPhone) {
    return result({ ...base, status: "notice", message: "No phone number found on the pages we checked, so there's nothing to compare." });
  }

  const problems: string[] = [];
  const sorted = [...where.values()].sort((a, b) => b.pages.length - a.pages.length);
  const value = sorted.map((e) => `${e.phone.display} on ${e.pages.length} page${e.pages.length === 1 ? "" : "s"}`).join("; ");

  // The main number is the most used one. A page that shows a phone but NOT the
  // main number is inconsistent. Extra numbers next to the main one are fine
  // (e.g. a store listing two lines on every page).
  const main = sorted[0];
  const conflicts = main ? pagePhones.filter((p) => !p.keys.has(main.phone.key)) : [];
  if (main && conflicts.length > 0) {
    const others = conflicts
      .slice(0, 3)
      .map((c) => `${[...c.keys].map((k) => where.get(k)!.phone.display).join(" / ")} (${c.path})`)
      .join(", ");
    problems.push(`Your main number is ${main.phone.display}, but ${conflicts.length === 1 ? "a page shows" : `${conflicts.length} pages show`} a different number instead: ${others}. Google and customers trust a business more when the same number is used everywhere. (If you have several locations, make sure each page shows the right one.)`);
  }
  if (schemaPhone && where.size > 0 && !where.has(schemaPhone.key)) {
    problems.push(`The phone number in your schema (${schemaPhone.display}) doesn't match the one shown on your pages.`);
  }
  if (business?.street) {
    const key = slug(business.street).split("-").slice(0, 2).join(" "); // e.g. "123 main"
    const allText = $pages.map((p) => slug(visibleText(p)).replace(/-/g, " ")).join(" ");
    if (key.length >= 3 && !allText.includes(key)) {
      problems.push(`The address in your schema ("${business.street}") isn't shown anywhere on the pages we checked.`);
    }
  }

  if (problems.length > 0) {
    return result({ ...base, status: "warning", value, message: problems.join(" ") });
  }
  const mainDisplay = main ? main.phone.display : schemaPhone!.display;
  const extra = sorted.length > 1 ? ` Other numbers listed alongside it: ${sorted.slice(1).map((e) => e.phone.display).join(", ")}.` : "";
  return result({ ...base, status: "passed", value, message: `Your main number, ${mainDisplay}, is used consistently across the site${business?.street ? ", and the schema address matches" : ""}.${extra}` });
}

/* ---------- Map + service area ---------- */

const MAP_LINK_RE = /google\.[a-z.]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl|g\.page\//i;
const AREA_TEXT_RE = /areas?\s+(we\s+)?serv(e|ed|ice)|service\s+areas?|proudly\s+serving/i;
// "Serving San Jose" — needs a capital letter (a place name), so no /i flag here.
const SERVING_CITY_RE = /[Ss]erving\s+(the\s+)?[A-Z][a-z]+/;

export function checkMapAndServiceArea($pages: CheerioAPI[], business: BusinessInfo | null): CheckResult {
  const base = { id: "map-service-area", title: "Map & service area", weight: 4 };

  const hasMap = $pages.some(($) =>
    $("iframe").toArray().some((f) => MAP_LINK_RE.test(`${$(f).attr("src") ?? ""} ${$(f).attr("data-src") ?? ""}`)) ||
    $("a[href]").toArray().some((a) => MAP_LINK_RE.test($(a).attr("href") ?? "")),
  );
  const hasArea = (business?.areaServed.length ?? 0) > 0 || $pages.some(($) => {
      const text = visibleText($);
      return AREA_TEXT_RE.test(text) || SERVING_CITY_RE.test(text);
    });

  if (hasMap && hasArea) {
    return result({ ...base, status: "passed", message: "Google Map and a list of the areas you serve were found." });
  }
  if (hasMap) {
    return result({ ...base, status: "notice", value: "map only", message: "There's a Google Map, but no clear \"Areas we serve\" section. List the cities and neighborhoods you work in." });
  }
  if (hasArea) {
    return result({ ...base, status: "notice", value: "service area only", message: "You list a service area, but there's no Google Map embed or link. Add one to your contact page so people can see where you are." });
  }
  return result({ ...base, status: "warning", message: "No Google Map and no \"Areas we serve\" section. Homeowners (and Google) can't tell which cities you work in." });
}

/* ---------- Run all ---------- */

export function runLocalSeoChecks(input: LocalSeoInput): CheckResult[] {
  const $pages = input.pages.map((p) => cheerio.load(p.html));
  const { business } = getBusinessSchema($pages);
  const cities = extractCityNames($pages, business);
  const titles = input.pages.map((p, i) => ({ url: p.url, title: clean($pages[i]("title").first().text()) }));

  // US state-code URL rules only make sense if the site shows a US "City, ST" address.
  const usStates = $pages.some(($) => new RegExp(CITY_STATE_RE.source).test(visibleText($)));
  // Crawled pages with Product schema are shop pages, not service/city pages.
  const exclude = new Set(
    input.pages
      .filter((_, i) => extractJsonLd($pages[i]).some((n) => typesOf(n).includes("Product")))
      .map((p) => pathOf(p.url).toLowerCase().replace(/\/+$/, "")),
  );

  return [
    checkLocalBusinessSchema($pages),
    checkNapConsistency(input.pages, $pages, business),
    checkServicePages(input, cities, titles, { usStates, exclude }),
    checkMapAndServiceArea($pages, business),
    checkSitemap(input),
  ];
}
