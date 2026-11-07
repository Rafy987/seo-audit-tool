import * as cheerio from "cheerio";
import type { SitePage } from "./checks/localSeo";
import { extractJsonLd, isLocalBusinessType, typesOf } from "./checks/localSeo";
import { CTA_RE } from "./checks/leadCapture";
import { clean } from "./checks/utils";

// Is this a contractor / home-service site, an online store, or something else?
// Simple points system over the crawled pages. Pure function, no network.

export type SiteType = "contractor" | "ecommerce" | "other";

export type SiteTypeResult = {
  type: SiteType;
  signals: string[]; // why we decided this, e.g. "Product schema", "Add to cart"
};

const ADD_TO_CART_RE = /add[\s_-]?to[\s_-]?(cart|basket|bag)|buy now/i;
const CART_LINK_RE = /\/(cart|basket|checkout)(\/|$|\?)/i;
const PLATFORM_RE = /cdn\.shopify\.com|woocommerce|prestashop|magento|bigcommerce|ecwid|wix-ecommerce|squarespace-commerce/i;
// Prices like $49.99, Rs3,000,000, PKR 1,500, £20, €15
const PRICE_RE = /(?:\$|£|€|₨|Rs\.?|PKR|USD|GBP|EUR)\s?\d[\d,]*(?:\.\d{2})?/g;

const AREA_RE = /areas?\s+(we\s+)?serv(e|ed|ice)|service\s+areas?|proudly\s+serving/i;
const LICENSED_RE = /licensed|insured|bonded/i;
const TRADE_RE =
  /\b(roofing|roofer|flooring installation|floor installation|hardwood floors?|plumbing|plumber|hvac|air conditioning repair|electrician|remodel(ing)?|contractor|landscaping|painting services|handyman|pest control|pressure washing|gutter|siding|concrete|fencing|water heater|drain cleaning)\b/gi;

export function detectSiteType(pages: SitePage[]): SiteTypeResult {
  let shop = 0;
  let service = 0;
  const signals: string[] = [];
  const add = (who: "shop" | "service", points: number, why: string) => {
    if (who === "shop") shop += points;
    else service += points;
    signals.push(why);
  };

  const $pages = pages.map((p) => cheerio.load(p.html));
  const ldTypes = $pages.flatMap(($) => extractJsonLd($).flatMap(typesOf));
  const allHtml = pages.map((p) => p.html).join("\n");
  const text = $pages
    .map(($) => {
      const body = $("body").clone();
      body.find("script, style, noscript, template").remove();
      return clean(body.text());
    })
    .join(" ");
  const clickables = $pages.flatMap(($) =>
    $("a, button, input[type=submit]").toArray().map((el) => clean(`${$(el).text()} ${$(el).attr("value") ?? ""} ${$(el).attr("class") ?? ""}`)),
  );
  const hrefs = $pages.flatMap(($) => $("a[href]").toArray().map((a) => $(a).attr("href") ?? ""));

  // --- Online store signals ---
  if (ldTypes.some((t) => /Product|Offer|AggregateOffer/.test(t))) add("shop", 3, "Product schema");
  if (clickables.some((c) => ADD_TO_CART_RE.test(c))) add("shop", 3, "\"Add to cart\" buttons");
  if (hrefs.some((h) => CART_LINK_RE.test(h))) add("shop", 1, "cart/checkout links");
  const platform = allHtml.match(PLATFORM_RE)?.[0];
  if (platform) add("shop", 2, `${platform} store`);
  const prices = text.match(PRICE_RE)?.length ?? 0;
  if (prices >= 5) add("shop", 2, `${prices} prices on the pages`);

  // --- Local service business signals ---
  const localType = ldTypes.find((t) => isLocalBusinessType(t) && !/Store$/.test(t));
  if (localType) add("service", localType === "LocalBusiness" ? 2 : 3, `${localType} schema`);
  if (clickables.some((c) => CTA_RE.test(c))) add("service", 2, "\"Free estimate / Get a quote\" buttons");
  if (AREA_RE.test(text)) add("service", 1, "service area text");
  if (LICENSED_RE.test(text)) add("service", 1, "licensed/insured text");
  const trades = new Set((text.match(TRADE_RE) ?? []).map((t) => t.toLowerCase()));
  if (trades.size >= 1) add("service", trades.size >= 3 ? 2 : 1, `trade words (${[...trades].slice(0, 3).join(", ")})`);

  let type: SiteType;
  if (shop >= 4 && shop > service) type = "ecommerce";
  else if (service >= 2) type = "contractor";
  else type = "other";

  return { type, signals };
}
