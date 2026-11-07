import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import {
  checkCanonical,
  checkH1,
  checkH2,
  checkImageAlt,
  checkLinks,
  checkMetaDescription,
  checkOpenGraph,
  checkRobotsMeta,
  checkTitle,
  checkWordCount,
  countWords,
  runOnPageChecks,
} from "./onPage";

const URL = "https://abcroofing.com/";
const $ = (html: string) => cheerio.load(html);
const words = (n: number) => Array.from({ length: n }, () => "roof").join(" ");

describe("checkTitle", () => {
  it("errors when the title is missing", () => {
    expect(checkTitle($("<html><head></head></html>")).status).toBe("error");
  });
  it("warns when the title is too short", () => {
    expect(checkTitle($("<title>Home</title>")).status).toBe("warning");
  });
  it("warns when the title is too long", () => {
    expect(checkTitle($(`<title>${"a".repeat(70)}</title>`)).status).toBe("warning");
  });
  it("passes a good title", () => {
    const r = checkTitle($("<title>Roof Repair in Dallas, TX | ABC Roofing</title>"));
    expect(r.status).toBe("passed");
    expect(r.value).toBe("Roof Repair in Dallas, TX | ABC Roofing");
  });
});

describe("checkMetaDescription", () => {
  it("warns when missing", () => {
    expect(checkMetaDescription($("<head></head>")).status).toBe("warning");
  });
  it("notices when too short", () => {
    expect(checkMetaDescription($('<meta name="description" content="Roofing.">')).status).toBe("notice");
  });
  it("passes a good length", () => {
    const d = "Licensed roofing contractor in Dallas, TX. Free roof inspections and estimates. Call today.";
    expect(checkMetaDescription($(`<meta name="description" content="${d}">`)).status).toBe("passed");
  });
});

describe("checkH1", () => {
  it("errors with no H1", () => {
    expect(checkH1($("<body><h2>Hi</h2></body>")).status).toBe("error");
  });
  it("warns with more than one H1", () => {
    expect(checkH1($("<h1>One</h1><h1>Two</h1>")).status).toBe("warning");
  });
  it("ignores empty H1 tags", () => {
    expect(checkH1($("<h1>Roofing</h1><h1> </h1>")).status).toBe("passed");
  });
});

describe("checkH2", () => {
  it("notices with no H2", () => {
    expect(checkH2($("<h1>x</h1>")).status).toBe("notice");
  });
  it("passes with H2s", () => {
    expect(checkH2($("<h2>Services</h2><h2>Areas</h2>")).status).toBe("passed");
  });
});

describe("checkImageAlt", () => {
  it("notices when there are no images", () => {
    expect(checkImageAlt($("<p>text</p>")).status).toBe("notice");
  });
  it("warns when some images have no or empty alt", () => {
    const r = checkImageAlt($('<img src="a.jpg" alt="New roof"><img src="b.jpg"><img src="c.jpg" alt=" ">'));
    expect(r.status).toBe("warning");
    expect(r.value).toBe("2 of 3 missing");
  });
  it("passes when all images have alt", () => {
    expect(checkImageAlt($('<img src="a.jpg" alt="Roof">')).status).toBe("passed");
  });
  it("uses 'has' for one missing and 'have' for more", () => {
    expect(checkImageAlt($('<img src="a.jpg"><img src="b.jpg" alt="x">')).message).toContain("1 of 2 images has no alt text");
    expect(checkImageAlt($('<img src="a.jpg"><img src="b.jpg">')).message).toContain("2 of 2 images have no alt text");
  });
  it("counts lazy-loaded images", () => {
    const html = `
      <img src="data:image/gif;base64,R0lGOD" data-src="/a.jpg" alt="Floor">
      <img data-lazy-src="/b.jpg">
      <img srcset="/c.jpg 1x, /c@2x.jpg 2x" alt="Deck">`;
    expect(checkImageAlt($(html)).value).toBe("1 of 3 missing");
  });
  it("skips noscript duplicates and tracking pixels", () => {
    const html = `
      <img data-src="/a.jpg" alt="Floor"><noscript><img src="/a.jpg"></noscript>
      <img src="https://px.example.com/t.gif" width="1" height="1">`;
    const r = checkImageAlt($(html));
    expect(r.status).toBe("passed");
    expect(r.message).toBe("The only image has alt text.");
  });
});

describe("checkCanonical", () => {
  it("notices when missing", () => {
    expect(checkCanonical($("<head></head>"), URL).status).toBe("notice");
  });
  it("passes for same site (www and relative ok)", () => {
    expect(checkCanonical($('<link rel="canonical" href="https://www.abcroofing.com/">'), URL).status).toBe("passed");
    expect(checkCanonical($('<link rel="canonical" href="/">'), URL).status).toBe("passed");
  });
  it("warns when it points to another domain", () => {
    expect(checkCanonical($('<link rel="canonical" href="https://other.com/">'), URL).status).toBe("warning");
  });
});

describe("checkRobotsMeta", () => {
  it("errors on noindex", () => {
    expect(checkRobotsMeta($('<meta name="robots" content="noindex, follow">')).status).toBe("error");
  });
  it("errors on googlebot none", () => {
    expect(checkRobotsMeta($('<meta name="googlebot" content="none">')).status).toBe("error");
  });
  it("passes with no robots tag", () => {
    expect(checkRobotsMeta($("<head></head>")).status).toBe("passed");
  });
});

describe("checkOpenGraph", () => {
  it("notices when og:image is missing", () => {
    const r = checkOpenGraph($('<meta property="og:title" content="ABC">'));
    expect(r.status).toBe("notice");
    expect(r.message).toContain("og:image");
  });
  it("passes with title and image", () => {
    expect(checkOpenGraph($('<meta property="og:title" content="ABC"><meta property="og:image" content="/a.jpg">')).status).toBe("passed");
  });
});

describe("word count", () => {
  it("ignores scripts and styles", () => {
    expect(countWords($("<body><p>new roof today</p><script>var a = 1</script><style>p{}</style></body>"))).toBe(3);
  });
  it("warns under 300 words", () => {
    expect(checkWordCount($(`<body><p>${words(120)}</p></body>`)).status).toBe("warning");
  });
  it("passes at 300+ words", () => {
    expect(checkWordCount($(`<body><p>${words(320)}</p></body>`)).status).toBe("passed");
  });
});

describe("checkLinks", () => {
  it("counts internal and external, skipping tel/mailto/#", () => {
    const html = `
      <a href="/services">Services</a>
      <a href="https://www.abcroofing.com/contact">Contact</a>
      <a href="https://facebook.com/abc">FB</a>
      <a href="tel:+12145551234">Call</a>
      <a href="mailto:a@b.com">Email</a>
      <a href="#top">Top</a>`;
    const r = checkLinks($(html), URL);
    expect(r.status).toBe("passed");
    expect(r.value).toBe("2 internal, 1 external");
  });
  it("warns when there are no internal links", () => {
    expect(checkLinks($('<a href="https://google.com">x</a>'), URL).status).toBe("warning");
  });
});

describe("runOnPageChecks", () => {
  it("returns all 10 on-page checks with unique ids", () => {
    const results = runOnPageChecks("<html><body></body></html>", URL);
    expect(results).toHaveLength(10);
    expect(new Set(results.map((r) => r.id)).size).toBe(10);
    expect(results.every((r) => r.category === "on-page")).toBe(true);
  });
});
