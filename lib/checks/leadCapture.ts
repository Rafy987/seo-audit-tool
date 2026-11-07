import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { CheckResult } from "./types";
import { clean } from "./utils";
import { findPhonesInText, parseTelHref } from "../phone";

// Lead capture checks: can a homeowner call or ask for a quote easily?
// All pure functions on parsed HTML. No network.

function result(r: Omit<CheckResult, "category">): CheckResult {
  return { category: "lead-capture", ...r };
}

// Header / navigation area (always visible on load).
const HEADER_SEL =
  'header, nav, [role="banner"], [role="navigation"], #header, #masthead, .site-header, [data-aid^="HEADER"]';

// Text not in the header that we treat as "the first screen".
// Static HTML has no screen height, so this is an estimate.
export const FOLD_CHARS = 500;

const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "svg"]);

// Strong "ask for a quote" wording.
export const CTA_RE =
  /free\s+(estimate|quote|inspection|consultation|measure|in-home)|get\s+(a\s+|your\s+|my\s+)?(free\s+)?(quote|estimate|pricing)|request\s+(a\s+|an\s+)?(free\s+)?(quote|estimate|service|appointment|consultation)|schedule\s+(a\s+|an\s+|your\s+)?(free\s+)?(estimate|consultation|appointment|service|inspection|now)|book\s+(now|online|a\s+|an\s+|your\s+)|call\s+(now|today|us)/i;

type Clickable = { text: string; href: string; inHeader: boolean; offset: number };

// Every link/button in document order, with how much body text comes before it.
export function getClickables($: CheerioAPI): Clickable[] {
  const items: Clickable[] = [];
  let offset = 0;

  $("body *").each((_, el) => {
    if (SKIP_TAGS.has(el.tagName) || $(el).parents("script, style, noscript, template, svg").length) return;
    const $el = $(el);
    const inHeader = $el.closest(HEADER_SEL).length > 0;

    const isButtonInput = el.tagName === "input" && /^(submit|button)$/i.test($el.attr("type") ?? "");
    if (el.tagName === "a" || el.tagName === "button" || isButtonInput) {
      const text = clean(isButtonInput ? $el.attr("value") : $el.text()) || clean($el.attr("aria-label"));
      items.push({ text, href: clean($el.attr("href")), inHeader, offset });
    }

    // Count only this element's own text, so nested text isn't counted twice.
    if (!inHeader) {
      $el.contents().each((_, node) => {
        if (node.type === "text") offset += clean(node.data).length;
      });
    }
  });
  return items;
}

const aboveFold = (c: Clickable) => c.inHeader || c.offset < FOLD_CHARS;

function visibleText($: CheerioAPI): string {
  const body = $("body").clone();
  body.find("script, style, noscript, template").remove();
  return clean(body.text());
}

export function checkClickToCall($: CheerioAPI): CheckResult {
  const tels = getClickables($).filter((c) => /^tel:/i.test(c.href));
  const base = { id: "click-to-call", title: "Click-to-call phone link", weight: 10 };

  if (tels.length === 0) {
    const phone = findPhonesInText(visibleText($))[0]?.display;
    if (phone) {
      return result({ ...base, status: "error", value: phone, message: `Your phone number (${phone}) isn't clickable on mobile. Most homeowners search on their phone and want to tap to call. Wrap it in a tel: link.` });
    }
    return result({ ...base, status: "error", message: "No phone number found on the page. Many homeowners would rather call than fill out a form. Add a tap-to-call number in the header." });
  }

  // All numbers in a link: "tel:0310-5521893, 0336-5033448" holds two.
  const numbers = (c: Clickable) => parseTelHref(c.href).map((p) => p.display).join(", ") || c.href.replace(/^tel:/i, "");
  const top = tels.find(aboveFold);
  if (!top) {
    return result({ ...base, status: "warning", value: numbers(tels[0]), message: "There's a click-to-call link, but only further down the page. Put it in the header so it's visible right away on mobile." });
  }
  return result({ ...base, status: "passed", value: numbers(top), message: "Tap-to-call phone link is visible at the top of the page." });
}

// Fields a visitor actually fills in.
const FIELD_SEL =
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea';

const EMBED_FORM_RE = /jotform|typeform|hsforms|hubspot|google\.com\/forms|forms\.gle|wufoo|cognitoforms|formstack|housecall|jobber|servicetitan|leadconnector|calendly/i;

// Real lead forms only: search boxes and newsletter sign-ups are skipped.
export function getLeadForms($: CheerioAPI) {
  return $("form").filter((_, form) => {
    const $f = $(form);
    const fields = $f.find(FIELD_SEL);
    if (fields.length === 0) return false;
    if ($f.is('[role="search"]') || $f.find('input[type="search"], input[name="s"], input[name="q"]').length) return false;
    if (/search/i.test(`${$f.attr("class") ?? ""} ${$f.attr("id") ?? ""} ${$f.attr("action") ?? ""}`)) return false;
    // A single email box = newsletter sign-up, not a quote request.
    const visible = fields.filter((_, el) => !/^(checkbox|radio)$/i.test($(el).attr("type") ?? ""));
    const newsletter = visible.length <= 1 && $f.find('input[type="email"], input[name*="email" i]').length > 0;
    return !newsletter;
  });
}

export function checkQuoteForm($: CheerioAPI): CheckResult {
  const base = { id: "quote-form", title: "Quote / contact form", weight: 8 };
  const forms = getLeadForms($);

  if (forms.length > 0) {
    const fieldCounts = forms.map((_, f) => $(f).find(FIELD_SEL).length).get();
    const fields = Math.min(...fieldCounts); // judge the shortest lead form
    if (fields > 6) {
      return result({ ...base, status: "warning", value: `${fields} fields`, message: `The form has ${fields} fields. Every extra field loses leads. Ask only for name, phone, email, and what they need.` });
    }
    return result({ ...base, status: "passed", value: `${fields} fields`, message: `Quote/contact form found with ${fields} field${fields === 1 ? "" : "s"}.` });
  }

  const embed = $("iframe[src], script[src]").filter((_, el) => EMBED_FORM_RE.test($(el).attr("src") ?? "")).length > 0;
  if (embed) {
    return result({ ...base, status: "passed", value: "embedded form", message: "An embedded form or booking widget was found. (Its fields can't be counted from the page code.)" });
  }

  const contactLink = $("a[href]").filter((_, a) =>
    /contact|quote|estimate/i.test(`${$(a).attr("href")} ${$(a).text()}`),
  ).length > 0;
  if (contactLink) {
    return result({ ...base, status: "notice", message: "No form on this page, only a link to a contact page. Every extra click loses leads, so add a short quote form here too." });
  }
  return result({ ...base, status: "error", message: "No quote or contact form found. Visitors who don't want to call have no way to ask for an estimate." });
}

export function checkCtaAboveFold($: CheerioAPI): CheckResult {
  const ctas = getClickables($).filter((c) => CTA_RE.test(c.text));
  const base = { id: "cta-above-fold", title: "\"Get a quote\" button at the top", weight: 8 };

  const top = ctas.find(aboveFold);
  if (top) {
    return result({ ...base, status: "passed", value: top.text, message: `A clear call to action ("${top.text}") is visible without scrolling.` });
  }
  if (ctas.length > 0) {
    return result({ ...base, status: "warning", value: ctas[0].text, message: `There's a "${ctas[0].text}" button, but visitors have to scroll to find it. Put a "Free Estimate" button in the header or the first section.` });
  }
  return result({ ...base, status: "error", message: "No \"Free Estimate\" or \"Get a Quote\" button found. Visitors aren't told what to do next, so many leave without contacting you." });
}

export function runLeadCaptureChecks(html: string): CheckResult[] {
  const $ = cheerio.load(html);
  return [checkClickToCall($), checkQuoteForm($), checkCtaAboveFold($)];
}
