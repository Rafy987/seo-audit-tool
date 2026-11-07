import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { CheckResult } from "./types";
import type { SitePage } from "./localSeo";
import { getContentImages } from "./onPage";
import { clean } from "./utils";

// Trust signals: would a homeowner trust this contractor enough to call?
// Pure functions over the crawled pages. No network.

export type TrustInput = {
  pages: SitePage[]; // pages[0] is the homepage
  urls: string[]; // every internal URL we know of
};

function result(r: Omit<CheckResult, "category">): CheckResult {
  return { category: "trust", ...r };
}

// One parsed page, prepared once and shared by all checks.
type Page = { path: string; $: CheerioAPI; text: string };

function preparePages(pages: SitePage[]): Page[] {
  return pages.map((p) => {
    const $ = cheerio.load(p.html);
    const body = $("body").clone();
    body.find("script, style, noscript, template").remove();
    let path = "/";
    try {
      path = new URL(p.url).pathname || "/";
    } catch {
      // keep "/"
    }
    return { path, $, text: clean(body.text()) };
  });
}

const where = (path: string) => (path === "/" ? "the homepage" : path);

// First page where `find` returns something; gives back the match and the page.
function findFirst(pages: Page[], find: (p: Page) => string | null): { match: string; path: string } | null {
  for (const p of pages) {
    const match = find(p);
    if (match) return { match, path: p.path };
  }
  return null;
}

const matchText = (re: RegExp) => (p: Page) => p.text.match(re)?.[0] ?? null;

// Any attribute (src, href, class, id, data-*) of any element matching `re`.
function matchAttr(re: RegExp) {
  return (p: Page): string | null => {
    let found: string | null = null;
    p.$("*").each((_, el) => {
      if (!("attribs" in el)) return; // only elements have attributes
      for (const value of Object.values(el.attribs)) {
        const m = value.match(re);
        if (m) {
          found = m[0];
          return false; // stop .each()
        }
      }
    });
    return found;
  };
}

/* ---------- Reviews ---------- */

const REVIEW_TEXT_RE =
  /testimonials?|what (our )?(customers|clients|homeowners) (are )?say(ing)?|(customer|client|google) reviews|read (our|more) reviews|[1-5](\.\d)?\s*(out of 5|stars?)\b|★★★★|5[- ]star/i;
const REVIEW_WIDGET_RE =
  /elfsight|trustindex|birdeye|nicejob|grade\.us|reviewsonmywebsite|embedsocial|trustpilot|wp-google-reviews|google-reviews|reviews\.io|podium|broadly|sociablekit|reviewbuzz/i;

export function checkReviews(pages: Page[]): CheckResult {
  const base = { id: "reviews", title: "Reviews & testimonials", weight: 6 };
  const widget = findFirst(pages, matchAttr(REVIEW_WIDGET_RE));
  const text = findFirst(pages, matchText(REVIEW_TEXT_RE));
  const hit = widget ?? text;

  if (!hit) {
    return result({ ...base, status: "warning", message: "No reviews or testimonials found on the site. Most homeowners check reviews before they call a contractor, so show a few real ones with the customer's name and city." });
  }
  const what = widget ? `A review widget (${widget.match})` : `Reviews/testimonials ("${clean(text!.match).slice(0, 40)}")`;
  return result({ ...base, status: "passed", value: hit.path, message: `${what} found on ${where(hit.path)}.` });
}

export function checkRatingSchema(pages: Page[]): CheckResult {
  const base = { id: "rating-schema", title: "Rating schema", weight: 2 };
  const hit = findFirst(pages, (p) => {
    const json = p.$('script[type="application/ld+json"]').map((_, el) => p.$(el).text()).get().join(" ");
    return json.match(/"@type"\s*:\s*"(AggregateRating|Review)"|"aggregateRating"/)?.[0] ?? null;
  });

  if (!hit) {
    return result({ ...base, status: "notice", message: "No review/rating schema found. It helps Google connect your reviews to your business. (Google usually won't show star ratings for reviews a business posts about itself, so this is a small win.)" });
  }
  return result({ ...base, status: "passed", value: hit.path, message: `Rating/review schema found on ${where(hit.path)}.` });
}

const GOOGLE_REVIEW_RE =
  /g\.page\/r\/|search\.google\.com\/local\/(writereview|reviews)|google\.[a-z.]+\/maps\/place|maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|google\.[a-z.]+\/search\?[^"']*(lrd=|reviews)|business\.google\.com/i;

export function checkGoogleReviewLink(pages: Page[]): CheckResult {
  const base = { id: "google-review-link", title: "Link to Google reviews", weight: 3 };
  const hit = findFirst(pages, (p) => {
    const href = p.$("a[href]").toArray().map((a) => p.$(a).attr("href") ?? "").find((h) => GOOGLE_REVIEW_RE.test(h));
    return href ?? null;
  });

  if (!hit) {
    return result({ ...base, status: "notice", message: "No link to your Google Business Profile or Google reviews. Link to it so visitors can read real reviews, and happy customers can leave new ones." });
  }
  return result({ ...base, status: "passed", value: hit.path, message: `Link to your Google profile/reviews found on ${where(hit.path)}.` });
}

/* ---------- License & insurance ---------- */

// "Lic #1234567", "License No. 123456", "CSLB #987654", "ROC 123456", "Reg. # 12345"
const LICENSE_NO_RE =
  /\b(?:lic(?:ense)?\.?\s*(?:no\.?|number|num\.?|#)?\s*:?\s*#?|cslb\s*(?:lic(?:ense)?\.?)?\s*(?:no\.?|#)?\s*:?\s*#?|roc\s*#?|reg(?:istration)?\.?\s*(?:no\.?|#)\s*:?)\s*([a-z]{0,4}[-\s]?\d[\d-]{4,})/i;
const LICENSE_WORD_RE = /\blicen[sc]ed\b|\blicen[sc]e\b/i;

export function checkLicense(pages: Page[]): CheckResult {
  const base = { id: "license", title: "License number", weight: 6 };
  const number = findFirst(pages, (p) => p.text.match(LICENSE_NO_RE)?.[0] ?? null);
  if (number) {
    return result({ ...base, status: "passed", value: clean(number.match), message: `License number shown ("${clean(number.match)}" on ${where(number.path)}). Homeowners can look it up and check you're legit.` });
  }
  const word = findFirst(pages, matchText(LICENSE_WORD_RE));
  if (word) {
    return result({ ...base, status: "warning", message: `The site says you're licensed (on ${where(word.path)}), but no license number is shown, so homeowners can't verify it. Add it to the footer, e.g. "Lic #1234567".` });
  }
  return result({ ...base, status: "warning", message: "No license information found. If your state requires a contractor license, show the number in the footer. Many homeowners check it before hiring." });
}

const INSURED_RE = /\binsured\b|\bbonded\b|liability insurance|workers'? comp/i;

export function checkInsured(pages: Page[]): CheckResult {
  const base = { id: "insured", title: "\"Licensed & insured\"", weight: 4 };
  const hit = findFirst(pages, matchText(INSURED_RE));
  if (!hit) {
    return result({ ...base, status: "warning", message: "The site never says you're insured or bonded. \"Licensed & insured\" near the top of the page reassures homeowners that they're protected if something goes wrong." });
  }
  return result({ ...base, status: "passed", value: hit.path, message: `Insurance mentioned ("${clean(hit.match)}" on ${where(hit.path)}).` });
}

/* ---------- Badges, warranty, gallery ---------- */

const BADGES: [string, RegExp][] = [
  ["BBB", /\bBBB\b|better business bureau|bbb\.org/i],
  ["Angi / HomeAdvisor", /\bangi\b|angi\.com|homeadvisor/i],
  ["Houzz", /houzz/i],
  ["NWFA", /\bNWFA\b|national wood flooring association/i],
  ["NARI", /\bNARI\b|national association of the remodeling/i],
  ["NAHB", /\bNAHB\b|national association of home builders/i],
  ["Manufacturer certified", /(gaf|owens corning|certainteed|shaw|mohawk|armstrong|james hardie|trane|carrier|lennox)[\w\s-]{0,30}(certified|preferred|master|elite|select|authorized)/i],
];

export function checkBadges(pages: Page[]): CheckResult {
  const base = { id: "badges", title: "BBB & accreditations", weight: 2 };
  const found: string[] = [];
  for (const [name, re] of BADGES) {
    const hit = findFirst(pages, (p) => {
      if (re.test(p.text)) return name;
      const attrs = p.$("a[href], img[alt], img[src]").toArray().map((el) => `${p.$(el).attr("href") ?? ""} ${p.$(el).attr("alt") ?? ""} ${p.$(el).attr("src") ?? ""}`);
      return attrs.some((a) => re.test(a)) ? name : null;
    });
    if (hit) found.push(name);
  }

  if (found.length === 0) {
    return result({ ...base, status: "notice", message: "No BBB, trade association or manufacturer badges found. If you have any (BBB, NWFA, Angi, a manufacturer certification), show the logos. They build quick trust." });
  }
  return result({ ...base, status: "passed", value: found.join(", "), message: `Found: ${found.join(", ")}.` });
}

const WARRANTY_RE = /warrant(y|ies)|guarantee[ds]?\b|satisfaction guaranteed/i;

export function checkWarranty(pages: Page[]): CheckResult {
  const base = { id: "warranty", title: "Warranty / guarantee", weight: 4 };
  const hit = findFirst(pages, matchText(WARRANTY_RE));
  if (!hit) {
    return result({ ...base, status: "warning", message: "No warranty or guarantee mentioned. A clear workmanship warranty (e.g. \"2-year installation warranty\") lowers the risk of hiring you." });
  }
  return result({ ...base, status: "passed", value: hit.path, message: `Warranty/guarantee mentioned on ${where(hit.path)}.` });
}

const GALLERY_PATH_RE = /gallery|portfolio|projects?\b|our-work|recent-work|before-(and-)?after|photos/i;
const BEFORE_AFTER_RE = /before\s*(&|and|\/)\s*after/i;
const MIN_GALLERY_IMAGES = 8;

export function checkGallery(pages: Page[], urls: string[]): CheckResult {
  const base = { id: "gallery", title: "Project photos / gallery", weight: 4 };

  const galleryUrl = [...pages.map((p) => p.path), ...urls.map((u) => {
    try {
      return new URL(u).pathname;
    } catch {
      return "";
    }
  })].find((path) => GALLERY_PATH_RE.test(path));
  if (galleryUrl) {
    return result({ ...base, status: "passed", value: galleryUrl, message: `Project gallery page found (${galleryUrl}).` });
  }

  const beforeAfter = findFirst(pages, matchText(BEFORE_AFTER_RE));
  if (beforeAfter) {
    return result({ ...base, status: "passed", value: beforeAfter.path, message: `Before & after photos found on ${where(beforeAfter.path)}.` });
  }

  const photoPage = findFirst(pages, (p) => {
    const count = getContentImages(p.$).length;
    return count >= MIN_GALLERY_IMAGES ? String(count) : null;
  });
  if (photoPage) {
    return result({ ...base, status: "passed", value: photoPage.path, message: `${photoPage.match} photos on ${where(photoPage.path)}.` });
  }
  return result({ ...base, status: "warning", message: "No project gallery found. Photos of real jobs you've done (not stock photos) are one of the strongest reasons a homeowner picks you." });
}

/* ---------- Run all ---------- */

export function runTrustChecks(input: TrustInput): CheckResult[] {
  const pages = preparePages(input.pages);
  return [
    checkReviews(pages),
    checkLicense(pages),
    checkInsured(pages),
    checkGallery(pages, input.urls),
    checkWarranty(pages),
    checkGoogleReviewLink(pages),
    checkBadges(pages),
    checkRatingSchema(pages),
  ];
}

// Exported for tests: build the prepared page list from raw HTML.
export { preparePages };
