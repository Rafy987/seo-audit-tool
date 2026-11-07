import { describe, expect, it } from "vitest";
import { detectSiteType } from "./siteType";
import { applySiteType, CONTRACTOR_ONLY } from "./checks/applicability";
import type { CheckResult } from "./checks/types";

const page = (html: string, path = "/") => ({ url: `https://example-site.com${path}`, html });
const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

describe("detectSiteType", () => {
  it("detects an online store (Product schema, add to cart, prices)", () => {
    const html = `${ld({ "@type": "Product", name: "Yamaha YBR 125", offers: { "@type": "Offer", price: 490500 } })}
      <a href="/cart">Cart</a>
      <button class="add-to-cart">Add to cart</button>
      <p>Rs490,500</p><p>Rs3,000,000</p><p>Rs1,100,000</p><p>Rs25,000</p><p>Rs9,999</p>`;
    const r = detectSiteType([page(html)]);
    expect(r.type).toBe("ecommerce");
    expect(r.signals).toContain("Product schema");
  });

  it("detects a contractor site", () => {
    const html = `${ld({ "@type": "HomeAndConstructionBusiness", name: "ABC Flooring" })}
      <a href="/quote">Get a Free Estimate</a>
      <p>Hardwood floors and flooring installation. Licensed &amp; insured. Areas we serve: Oakland.</p>`;
    expect(detectSiteType([page(html)]).type).toBe("contractor");
  });

  it("keeps a contractor that also has a small shop as contractor", () => {
    const html = `${ld({ "@type": "RoofingContractor", name: "ABC Roofing" })}
      <a href="/quote">Request a Free Quote</a><a href="/cart">Cart</a>
      <p>Roofing and gutter repair. Licensed and insured.</p>`;
    expect(detectSiteType([page(html)]).type).toBe("contractor");
  });

  it("says 'other' for a plain site with no signals", () => {
    expect(detectSiteType([page("<h1>Example Domain</h1><p>For documentation.</p>")]).type).toBe("other");
  });
});

describe("applySiteType", () => {
  const check = (id: string): CheckResult => ({ id, category: "trust", title: id, status: "error", message: "bad", weight: 5, value: "x" });
  const checks = [check("license"), check("map-service-area"), check("title"), check("click-to-call")];

  it("leaves everything alone for contractor sites", () => {
    expect(applySiteType(checks, "contractor")).toEqual(checks);
  });
  it("marks only contractor-only checks as N/A for other sites", () => {
    const r = applySiteType(checks, "ecommerce");
    expect(r.map((c) => c.status)).toEqual(["na", "na", "error", "error"]);
    expect(r[0].message).toContain("Not applicable");
    expect(r[0].value).toBeUndefined();
  });
  it("turns a missing LocalBusiness schema from Error into Notice on an online store", () => {
    const r = applySiteType([{ ...check("local-schema"), category: "local-seo" }], "ecommerce");
    expect(r[0].status).toBe("notice");
    expect(r[0].message).toContain("physical shop");
    // ...but keeps it as an Error for contractors
    expect(applySiteType([check("local-schema")], "contractor")[0].status).toBe("error");
  });
  it("covers the checks the user listed (quote button, license, insured, service area, map, BBB)", () => {
    for (const id of ["cta-above-fold", "license", "insured", "service-city-pages", "map-service-area", "badges"]) {
      expect(CONTRACTOR_ONLY.has(id)).toBe(true);
    }
  });
});
