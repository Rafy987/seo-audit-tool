import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import {
  checkClickToCall,
  checkCtaAboveFold,
  checkQuoteForm,
  getClickables,
  runLeadCaptureChecks,
} from "./leadCapture";

const $ = (html: string) => cheerio.load(html);
const filler = (chars: number) => `<p>${"x".repeat(chars)}</p>`;

describe("checkClickToCall", () => {
  it("passes with a tel: link in the header", () => {
    const r = checkClickToCall($('<header><a href="tel:+12145551234">(214) 555-1234</a></header>'));
    expect(r.status).toBe("passed");
    expect(r.value).toBe("+12145551234");
  });
  it("errors when the number is plain text, not a link", () => {
    const r = checkClickToCall($("<header><span>Call (214) 555-1234</span></header>"));
    expect(r.status).toBe("error");
    expect(r.message).toContain("(214) 555-1234");
    expect(r.message).toContain("isn't clickable");
  });
  it("errors when there's no phone number at all", () => {
    expect(checkClickToCall($("<p>Welcome to our site</p>")).message).toContain("No phone number");
  });
  it("warns when the tel: link is only far down the page", () => {
    const html = `<body><main>${filler(800)}<a href="tel:2145551234">Call</a></main></body>`;
    expect(checkClickToCall($(html)).status).toBe("warning");
  });
  it("does not treat dates or zip codes as phone numbers", () => {
    expect(checkClickToCall($("<p>Since 2005. Dallas, TX 75201. Call 2145551234</p>")).message).toContain("No phone number");
  });
});

describe("checkQuoteForm", () => {
  const form = (n: number) =>
    `<form>${Array.from({ length: n }, (_, i) => `<input name="f${i}">`).join("")}<input type="hidden" name="t"><button>Send</button></form>`;

  it("passes a short lead form and counts only real fields", () => {
    const r = checkQuoteForm($(form(4)));
    expect(r.status).toBe("passed");
    expect(r.value).toBe("4 fields");
  });
  it("warns when the form is too long", () => {
    expect(checkQuoteForm($(form(9))).status).toBe("warning");
  });
  it("ignores search and newsletter forms", () => {
    const html = `
      <form role="search"><input type="search" name="s"></form>
      <form class="newsletter"><input type="email" name="email"><button>Subscribe</button></form>
      <a href="/about">About</a>`;
    expect(checkQuoteForm($(html)).status).toBe("error");
  });
  it("accepts embedded form widgets", () => {
    expect(checkQuoteForm($('<iframe src="https://form.jotform.com/123"></iframe>')).status).toBe("passed");
  });
  it("gives a notice when only a contact page link exists", () => {
    expect(checkQuoteForm($('<a href="/contact-us">Contact</a>')).status).toBe("notice");
  });
});

describe("checkCtaAboveFold", () => {
  it("passes with a CTA in the header", () => {
    const r = checkCtaAboveFold($('<header><a href="/quote">Get a Free Estimate</a></header>'));
    expect(r.status).toBe("passed");
    expect(r.value).toBe("Get a Free Estimate");
  });
  it("passes with a CTA button near the top of the body", () => {
    expect(checkCtaAboveFold($('<main><h1>Flooring in San Jose</h1><button>Request a Quote</button></main>')).status).toBe("passed");
  });
  it("accepts submit inputs by value", () => {
    expect(checkCtaAboveFold($('<form><input type="submit" value="Get My Free Quote"></form>')).status).toBe("passed");
  });
  it("warns when the CTA is only below the fold", () => {
    const html = `<main>${filler(900)}<a href="/quote">Free Estimate</a></main>`;
    expect(checkCtaAboveFold($(html)).status).toBe("warning");
  });
  it("errors with only generic links", () => {
    expect(checkCtaAboveFold($('<a href="/about">About Us</a><a href="/blog">Read more</a>')).status).toBe("error");
  });
});

describe("getClickables", () => {
  it("does not count header/menu text toward the fold", () => {
    const html = `<header><nav>${filler(2000)}</nav></header><main><a href="/q">Get a Quote</a></main>`;
    const items = getClickables($(html));
    expect(items[0].offset).toBe(0);
  });
});

describe("runLeadCaptureChecks", () => {
  it("returns 3 lead capture checks", () => {
    const r = runLeadCaptureChecks("<html><body></body></html>");
    expect(r.map((c) => c.id)).toEqual(["click-to-call", "quote-form", "cta-above-fold"]);
    expect(r.every((c) => c.category === "lead-capture")).toBe(true);
  });
});
