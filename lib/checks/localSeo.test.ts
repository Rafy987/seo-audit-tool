import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import {
  checkLocalBusinessSchema,
  checkMapAndServiceArea,
  checkNapConsistency,
  checkServicePages,
  classifyPages,
  extractJsonLd,
  getBusinessSchema,
  runLocalSeoChecks,
  type SitePage,
} from "./localSeo";

const BASE = "https://abcflooring.com";
const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
const load = (html: string) => cheerio.load(html);

const fullBusiness = {
  "@context": "https://schema.org",
  "@type": "HomeAndConstructionBusiness",
  name: "ABC Flooring",
  telephone: "+1-408-555-0123",
  address: { "@type": "PostalAddress", streetAddress: "123 Main St", addressLocality: "San Jose", addressRegion: "CA" },
  areaServed: ["San Jose", { "@type": "City", name: "Campbell" }],
};

describe("extractJsonLd", () => {
  it("flattens @graph and arrays and skips broken JSON", () => {
    const html =
      ld({ "@graph": [{ "@type": "WebSite" }, { "@type": "Organization" }] }) +
      ld([{ "@type": "Plumber" }]) +
      '<script type="application/ld+json">{ broken </script>';
    expect(extractJsonLd(load(html)).map((n) => n["@type"])).toEqual(["WebSite", "Organization", "Plumber"]);
  });
});

describe("checkLocalBusinessSchema", () => {
  it("passes with a full LocalBusiness subtype", () => {
    const r = checkLocalBusinessSchema([load(ld(fullBusiness))]);
    expect(r.status).toBe("passed");
    expect(r.value).toBe("HomeAndConstructionBusiness");
  });
  it("finds it inside @graph (Yoast / Rank Math)", () => {
    expect(checkLocalBusinessSchema([load(ld({ "@graph": [fullBusiness] }))]).status).toBe("passed");
  });
  it("warns and lists missing fields", () => {
    const r = checkLocalBusinessSchema([load(ld({ "@type": "RoofingContractor", name: "ABC" }))]);
    expect(r.status).toBe("warning");
    expect(r.message).toContain("address, telephone, areaServed");
  });
  it("errors when there's only Organization schema", () => {
    const r = checkLocalBusinessSchema([load(ld({ "@type": "Organization", name: "ABC" }))]);
    expect(r.status).toBe("error");
    expect(r.message).toContain("Organization");
  });
  it("checks other pages if the homepage has none", () => {
    expect(checkLocalBusinessSchema([load("<p>home</p>"), load(ld(fullBusiness))]).status).toBe("passed");
  });
});

describe("classifyPages", () => {
  const urls = [
    `${BASE}/`,
    `${BASE}/services`,
    `${BASE}/hardwood-flooring`,
    `${BASE}/tile-installation`,
    `${BASE}/service-areas/campbell`,
    `${BASE}/flooring-in-los-gatos`,
    `${BASE}/vinyl-plank-san-jose-ca`,
    `${BASE}/built-in-cabinets`,
    `${BASE}/blog/how-to-clean-hardwood-floors`,
    `${BASE}/contact-me`,
  ];
  it("finds service and city pages and skips blog/hub/home", () => {
    const { service, city } = classifyPages(urls);
    // "/flooring-in-los-gatos" is both a service page and a city page.
    expect(service.sort()).toEqual(["/built-in-cabinets", "/flooring-in-los-gatos", "/hardwood-flooring", "/tile-installation", "/vinyl-plank-san-jose-ca"].sort());
    expect(city.sort()).toEqual(["/flooring-in-los-gatos", "/service-areas/campbell", "/vinyl-plank-san-jose-ca"].sort());
  });
  it("finds one-word city + state, but not /sign-in or /contact-me style pages", () => {
    const { city } = classifyPages(["/orinda-ca", "/moraga-ca", "/sign-in", "/about-me", "/learn-more", "/go-to"].map((p) => BASE + p));
    expect(city.sort()).toEqual(["/moraga-ca", "/orinda-ca"]);
  });
  it("uses city names from schema", () => {
    expect(classifyPages([`${BASE}/campbell-flooring`], ["Campbell"]).city).toEqual(["/campbell-flooring"]);
  });
});

describe("checkServicePages", () => {
  const input = (urls: string[], sitemapFound = true) => ({ pages: [], urls, sitemapFound });
  it("errors with no service or city pages and mentions missing sitemap", () => {
    const r = checkServicePages(input([`${BASE}/about`], false), []);
    expect(r.status).toBe("error");
    expect(r.message).toContain("sitemap.xml");
  });
  it("warns when there are service pages but no city pages", () => {
    expect(checkServicePages(input([`${BASE}/hardwood-flooring`]), []).status).toBe("warning");
  });
  it("passes with both", () => {
    expect(checkServicePages(input([`${BASE}/hardwood-flooring`, `${BASE}/areas/campbell`]), []).status).toBe("passed");
  });
});

describe("checkNapConsistency", () => {
  const run = (pages: SitePage[], schema?: object) => {
    const $pages = pages.map((p) => load(p.html));
    return checkNapConsistency(pages, $pages, schema ? getBusinessSchema([load(ld(schema))]).business : null);
  };

  it("passes when every page uses the same number (any format)", () => {
    const r = run([
      { url: `${BASE}/`, html: '<a href="tel:+14085550123">Call</a>' },
      { url: `${BASE}/contact`, html: "<p>Call (408) 555-0123 or visit 123 Main St</p>" },
    ], fullBusiness);
    expect(r.status).toBe("passed");
  });
  it("warns with two different numbers and says where", () => {
    const r = run([
      { url: `${BASE}/`, html: "<p>408-555-0123</p>" },
      { url: `${BASE}/contact`, html: "<p>408-555-9999</p>" },
    ]);
    expect(r.status).toBe("warning");
    expect(r.message).toContain("(408) 555-9999 (/contact)");
  });
  it("warns when the schema phone doesn't match the site", () => {
    const r = run([{ url: `${BASE}/`, html: "<p>408-555-7777 123 Main St</p>" }], fullBusiness);
    expect(r.message).toContain("doesn't match");
  });
  it("warns when the schema address isn't on the site", () => {
    const r = run([{ url: `${BASE}/`, html: "<p>(408) 555-0123</p>" }], fullBusiness);
    expect(r.message).toContain("123 Main St");
  });
  it("gives a notice when there's no phone at all", () => {
    expect(run([{ url: `${BASE}/`, html: "<p>hello</p>" }]).status).toBe("notice");
  });
});

describe("checkMapAndServiceArea", () => {
  it("passes with a map embed and an areas section", () => {
    const $ = load('<iframe src="https://www.google.com/maps/embed?pb=1"></iframe><h2>Areas We Serve</h2>');
    expect(checkMapAndServiceArea([$], null).status).toBe("passed");
  });
  it("counts lazy-loaded map iframes and maps links", () => {
    expect(checkMapAndServiceArea([load('<iframe data-src="https://maps.google.com/?q=x"></iframe><p>Serving San Jose</p>')], null).status).toBe("passed");
    expect(checkMapAndServiceArea([load('<a href="https://maps.app.goo.gl/abc">Directions</a>')], null).status).toBe("notice");
  });
  it("warns when neither is found", () => {
    expect(checkMapAndServiceArea([load("<p>We do floors.</p>")], null).status).toBe("warning");
  });
});

describe("runLocalSeoChecks", () => {
  it("returns 5 local SEO checks", () => {
    const r = runLocalSeoChecks({ pages: [{ url: `${BASE}/`, html: "<body></body>" }], urls: [], sitemapFound: false });
    expect(r.map((c) => c.id)).toEqual(["local-schema", "nap", "service-city-pages", "map-service-area", "sitemap"]);
    expect(r.every((c) => c.category === "local-seo")).toBe(true);
  });
});
