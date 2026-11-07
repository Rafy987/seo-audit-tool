import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { CheckResult } from "./types";
import { clean, formatPhone, normalizePhone, PHONE_RE_ALL } from "./utils";

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

const typesOf = (node: JsonObject): string[] =>
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

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function classifyPages(urls: string[], cities: string[] = []) {
  const citySlugs = cities.map(slug).filter((s) => s.length >= 3);
  const service = new Set<string>();
  const city = new Set<string>();

  for (const u of urls) {
    let path: string;
    try {
      path = new URL(u).pathname.toLowerCase().replace(/\/+$/, "");
    } catch {
      continue;
    }
    if (!path || path === "/" || SKIP_PATH_RE.test(path)) continue;
    const last = path.split("/").pop() ?? "";

    const isCity =
      AREA_HUB_RE.test(path) ||
      /(?<!built)-in-[a-z]{3,}/.test(last) ||
      STATE_SUFFIX_RE.test(last) ||
      ONE_WORD_STATE_RE.test(last) ||
      citySlugs.some((c) => last.includes(c));
    if (isCity) city.add(path);
    if (SERVICE_RE.test(last)) service.add(path);
  }
  return { service: [...service], city: [...city] };
}

export function checkServicePages(input: LocalSeoInput, cities: string[]): CheckResult {
  const { service, city } = classifyPages(input.urls, cities);
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

export function phonesOnPage($: CheerioAPI): Set<string> {
  const found = new Set<string>();
  $('a[href^="tel:" i]').each((_, a) => {
    const p = normalizePhone(($(a).attr("href") ?? "").slice(4));
    if (p) found.add(p);
  });
  for (const m of visibleText($).match(PHONE_RE_ALL) ?? []) {
    const p = normalizePhone(m);
    if (p) found.add(p);
  }
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

  // phone -> pages it appears on
  const where = new Map<string, string[]>();
  $pages.forEach(($, i) => {
    for (const p of phonesOnPage($)) where.set(p, [...(where.get(p) ?? []), pathOf(pages[i].url)]);
  });

  const schemaPhone = business?.telephone ? normalizePhone(business.telephone) : null;
  if (where.size === 0 && !schemaPhone) {
    return result({ ...base, status: "notice", message: "No phone number found on the pages we checked, so there's nothing to compare." });
  }

  const problems: string[] = [];
  const sorted = [...where.entries()].sort((a, b) => b[1].length - a[1].length);
  const value = sorted.map(([p, list]) => `${formatPhone(p)} on ${list.length} page${list.length === 1 ? "" : "s"}`).join("; ");

  if (where.size > 1) {
    const detail = sorted
      .map(([p, list]) => `${formatPhone(p)} (${list.slice(0, 2).join(", ")}${list.length > 2 ? "…" : ""})`)
      .join(", ");
    problems.push(`${where.size} different phone numbers appear on the site: ${detail}. Google and customers trust a business more when the same number is used everywhere. (If you have several locations, make sure each page shows the right one.)`);
  }
  if (schemaPhone && where.size > 0 && !where.has(schemaPhone)) {
    problems.push(`The phone number in your schema (${formatPhone(schemaPhone)}) doesn't match the one shown on your pages.`);
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
  const only = sorted[0] ? formatPhone(sorted[0][0]) : formatPhone(schemaPhone!);
  return result({ ...base, status: "passed", value, message: `The same phone number, ${only}, is used across the site${business?.street ? ", and the schema address matches" : ""}.` });
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
  const cities = [business?.city, ...(business?.areaServed ?? [])].filter((c): c is string => !!c);

  return [
    checkLocalBusinessSchema($pages),
    checkNapConsistency(input.pages, $pages, business),
    checkServicePages(input, cities),
    checkMapAndServiceArea($pages, business),
    checkSitemap(input),
  ];
}
