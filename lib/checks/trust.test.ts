import { describe, expect, it } from "vitest";
import {
  checkBadges,
  checkGallery,
  checkGoogleReviewLink,
  checkInsured,
  checkLicense,
  checkRatingSchema,
  checkReviews,
  checkWarranty,
  preparePages,
  runTrustChecks,
} from "./trust";

const BASE = "https://abcflooring.com";
// pages("<home html>", ["/about", "<about html>"], ...)
const pages = (home: string, ...more: [string, string][]) =>
  preparePages([{ url: `${BASE}/`, html: home }, ...more.map(([path, html]) => ({ url: BASE + path, html }))]);
const empty = pages("<body><p>We install floors.</p></body>");

describe("checkReviews", () => {
  it("finds testimonials text and says which page", () => {
    const r = checkReviews(pages("<p>Home</p>", ["/about", "<h2>What Our Customers Say</h2>"]));
    expect(r.status).toBe("passed");
    expect(r.message).toContain("/about");
  });
  it("finds a review widget by script/class", () => {
    const r = checkReviews(pages('<div class="elfsight-app-123"></div>'));
    expect(r.status).toBe("passed");
    expect(r.message).toContain("widget");
  });
  it("finds star ratings", () => {
    expect(checkReviews(pages("<p>Rated 4.9 stars by 120 homeowners</p>")).status).toBe("passed");
  });
  it("warns when there are none", () => {
    expect(checkReviews(empty).status).toBe("warning");
  });
});

describe("checkRatingSchema", () => {
  it("finds aggregateRating nested inside LocalBusiness", () => {
    const ld = { "@type": "LocalBusiness", name: "ABC", aggregateRating: { "@type": "AggregateRating", ratingValue: 4.9 } };
    expect(checkRatingSchema(pages(`<script type="application/ld+json">${JSON.stringify(ld)}</script>`)).status).toBe("passed");
  });
  it("gives a notice when missing", () => {
    expect(checkRatingSchema(empty).status).toBe("notice");
  });
});

describe("checkGoogleReviewLink", () => {
  it.each([
    "https://g.page/r/CabcXYZ/review",
    "https://search.google.com/local/writereview?placeid=abc",
    "https://www.google.com/maps/place/ABC+Flooring",
    "https://maps.app.goo.gl/xyz",
  ])("finds %s", (href) => {
    expect(checkGoogleReviewLink(pages(`<a href="${href}">Reviews</a>`)).status).toBe("passed");
  });
  it("ignores other Google links", () => {
    expect(checkGoogleReviewLink(pages('<a href="https://www.google.com/">Google</a>')).status).toBe("notice");
  });
});

describe("checkLicense", () => {
  it.each(["Lic #1045678", "License No. 987654", "CSLB #1012345", "CA Lic. 1045678", "ROC 123456"])("finds '%s'", (text) => {
    const r = checkLicense(pages(`<footer>${text}</footer>`));
    expect(r.status).toBe("passed");
  });
  it("warns when 'licensed' has no number", () => {
    const r = checkLicense(pages("<p>Licensed since 2005</p>"));
    expect(r.status).toBe("warning");
    expect(r.message).toContain("no license number");
  });
  it("warns when nothing is mentioned", () => {
    expect(checkLicense(empty).message).toContain("No license information");
  });
});

describe("checkInsured", () => {
  it("finds licensed & insured", () => {
    expect(checkInsured(pages("<p>Licensed, Bonded &amp; Insured</p>")).status).toBe("passed");
  });
  it("does not count 'uninsured'", () => {
    expect(checkInsured(pages("<p>Don't hire uninsured contractors</p>")).status).toBe("warning");
  });
});

describe("checkBadges", () => {
  it("finds BBB by link and NWFA by text", () => {
    const r = checkBadges(pages('<a href="https://www.bbb.org/us/ca/abc">A+</a>', ["/about", "<p>Member of the NWFA</p>"]));
    expect(r.status).toBe("passed");
    expect(r.value).toBe("BBB, NWFA");
  });
  it("finds a badge by image alt", () => {
    expect(checkBadges(pages('<img src="/a.png" alt="GAF Master Elite contractor">')).value).toBe("Manufacturer certified");
  });
  it("gives a notice when none", () => {
    expect(checkBadges(empty).status).toBe("notice");
  });
});

describe("checkWarranty", () => {
  it("finds warranty text", () => {
    expect(checkWarranty(pages("<p>Lifetime installation warranty</p>")).status).toBe("passed");
  });
  it("warns when missing", () => {
    expect(checkWarranty(empty).status).toBe("warning");
  });
});

describe("checkGallery", () => {
  it("finds a gallery URL from the sitemap", () => {
    expect(checkGallery(empty, [`${BASE}/our-work`]).value).toBe("/our-work");
  });
  it("finds before & after text", () => {
    expect(checkGallery(pages("<h2>Before &amp; After</h2>"), []).status).toBe("passed");
  });
  it("counts a page with many photos", () => {
    const imgs = Array.from({ length: 9 }, (_, i) => `<img src="/p${i}.jpg" alt="x">`).join("");
    expect(checkGallery(pages(imgs), []).status).toBe("passed");
  });
  it("warns when there's no gallery", () => {
    expect(checkGallery(empty, [`${BASE}/about`]).status).toBe("warning");
  });
});

describe("runTrustChecks", () => {
  it("returns 8 trust checks", () => {
    const r = runTrustChecks({ pages: [{ url: `${BASE}/`, html: "<body></body>" }], urls: [] });
    expect(r).toHaveLength(8);
    expect(new Set(r.map((c) => c.id)).size).toBe(8);
    expect(r.every((c) => c.category === "trust")).toBe(true);
  });
});
