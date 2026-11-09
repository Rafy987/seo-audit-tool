import { describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { AuditBasicInfo } from "@/app/api/audit/route";
import type { CheckResult } from "./checks/types";
import { buildPdfData, pdfText } from "./pdfData";
import AuditPdf from "../components/pdf/AuditPdf";

const check = (id: string, status: CheckResult["status"], extra: Partial<CheckResult> = {}): CheckResult => ({
  id,
  category: "lead-capture",
  status,
  title: id,
  message: `${id} message`,
  weight: 8,
  ...extra,
});

const info: AuditBasicInfo = {
  requestedUrl: "https://www.abcflooring.com/",
  finalUrl: "https://www.abcflooring.com/",
  status: 200,
  loadMs: 640,
  bytes: 190_000,
  redirects: 0,
  title: "ABC Flooring",
  pagesCrawled: 20,
  sitemapFound: true,
  siteType: "contractor",
  siteTypeSignals: [],
  preparedBy: null,
  speed: { mobile: { strategy: "mobile", score: 42, lcpMs: 12_000, lcpSource: "lab", cls: 0.03, clsSource: "lab", inpMs: null }, desktop: { strategy: "desktop", score: 67, lcpMs: 1500, lcpSource: "lab", cls: 0.01, clsSource: "lab", inpMs: null } },
  checks: [
    check("click-to-call", "passed", { title: "Click-to-call phone link" }),
    check("license", "warning", { category: "trust", title: "License number" }),
    check("speed-mobile", "error", { category: "speed", title: "Mobile speed score" }),
    check("rating-schema", "notice", { category: "trust" }),
    check("badges", "na", { category: "trust" }),
  ],
};
const report = { summary: "Your site is losing leads because it‑loads slowly.", fixes: [{ title: "Compress large photos", detail: "Smaller photos load faster." }] };
const NOW = new Date("2026-11-09T12:00:00Z");

describe("buildPdfData", () => {
  it("uses the AI report when there is one", () => {
    const d = buildPdfData(info, report, NOW);
    expect(d.fileName).toBe("leadleak-audit-abcflooring.com-2026-11-09.pdf");
    expect(d.dateLabel).toBe("November 9, 2026");
    expect(d.summary).toBe("Your site is losing leads because it-loads slowly."); // non-breaking hyphen fixed
    expect(d.fixesHeading).toBe("What to fix first");
    expect(d.fixes[0].title).toBe("Compress large photos");
  });
  it("falls back to the rule-based Top reasons without a report", () => {
    const d = buildPdfData(info, null, NOW);
    expect(d.summary).toBeNull();
    expect(d.fixesHeading).toBe("Top reasons you're losing leads");
    expect(d.fixes.length).toBeGreaterThan(0);
  });
  it("lists issues by impact, passed checks, speed and limits; skips N/A", () => {
    const d = buildPdfData(info, report, NOW);
    expect(d.issues.map((i) => i.title)).toContain("License number");
    expect(d.issues.every((i) => i.status !== ("na" as never))).toBe(true);
    expect(d.passed).toEqual(["Click-to-call phone link"]);
    expect(d.speed?.mobile).toBe(42);
    expect(d.speed?.rows[0].value).toBe("12.0 s");
    expect(d.speed?.rows[2].value).toBe("not enough real-user data");
    expect(d.limits[0]).toContain("only inside the website");
    expect(d.siteTypeNote).toBeNull();
  });
  it("adds the 'built for contractors' note and a speed note when needed", () => {
    const d = buildPdfData({ ...info, siteType: "ecommerce", speed: { mobile: null, desktop: null, error: "Google's speed test took too long." } }, null, NOW);
    expect(d.siteTypeNote).toContain("built for contractor");
    expect(d.speed).toBeNull();
    expect(d.speedNote).toContain("took too long");
  });
});

describe("pdfText", () => {
  it("replaces characters Helvetica can't draw", () => {
    expect(pdfText("tap‑to‑call − 3 s ✨")).toBe("tap-to-call - 3 s ");
    expect(pdfText("“quotes” – dash • bullet")).toBe("“quotes” – dash • bullet");
  });
});

describe("AuditPdf (smoke test)", () => {
  it("renders a real PDF file", async () => {
    // AuditPdf returns a <Document>, but TypeScript can't see that through the wrapper, so we tell it.
    const doc = createElement(AuditPdf, { data: buildPdfData(info, report, NOW) }) as unknown as ReactElement<DocumentProps>;
    const buffer = await renderToBuffer(doc);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(2000);
  }, 30_000);
});

describe("PDF extras from user feedback", () => {
  it("adds 'mobile weighted more' next to the Speed score only", () => {
    const d = buildPdfData(info, report, NOW);
    expect(d.categories.find((c) => c.label === "Speed")?.note).toBe("mobile weighted more");
    expect(d.categories.filter((c) => c.note)).toHaveLength(1);
  });
  it("includes the Prepared by block only when set", () => {
    expect(buildPdfData(info, report, NOW).preparedBy).toBeNull();
    const pb = { name: "Abdul Rafy", email: "rafy@example.com" };
    expect(buildPdfData({ ...info, preparedBy: pb }, report, NOW).preparedBy).toEqual(pb);
  });
  it("renders the PDF with the Prepared by block", async () => {
    const data = buildPdfData({ ...info, preparedBy: { name: "Abdul Rafy", email: "rafy@example.com", url: "https://linkedin.com/in/rafy" } }, report, NOW);
    const buffer = await renderToBuffer(createElement(AuditPdf, { data }) as unknown as ReactElement<DocumentProps>);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  }, 30_000);
});
