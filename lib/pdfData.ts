import type { AuditBasicInfo } from "@/app/api/audit/route";
import type { AiReport } from "./aiReport";
import type { CheckStatus } from "./checks/types";
import type { PreparedBy } from "./preparedBy";
import { CATEGORY_LABELS, computeScores, countStatuses, rankIssues, scoreBand, topReasons } from "./score";

// Everything the PDF shows, already formatted. Pure function (tested), so the
// PDF component only lays it out.

export type PdfIssue = { status: Exclude<CheckStatus, "passed" | "na">; title: string; category: string; message: string; impact: number };

export type PdfData = {
  fileName: string;
  host: string;
  url: string;
  dateLabel: string; // "November 9, 2026"
  siteTypeNote: string | null;
  overall: number | null;
  bandLabel: string;
  categories: { label: string; score: number | null; note?: string }[];
  preparedBy: PreparedBy | null;
  counts: { errors: number; warnings: number; notices: number; passed: number };
  summary: string | null; // AI summary, if the report was written
  fixes: { title: string; detail: string }[];
  fixesHeading: string;
  issues: PdfIssue[];
  speed: { mobile: number | null; desktop: number | null; rows: { label: string; value: string }[] } | null;
  speedNote: string | null;
  passed: string[];
  pagesChecked: number;
  limits: string[];
};

const MAX_ISSUES = 20;
// The mobile speed check weighs more than desktop (see lib/checks/speed.ts WEIGHTS).
export const SPEED_NOTE = "mobile weighted more";
const BAND_LABEL = { poor: "Losing leads", fair: "Needs work", good: "In good shape" } as const;

// The PDF uses the built-in Helvetica font, which can't draw some Unicode
// characters (e.g. the non-breaking hyphen the AI sometimes writes). Swap them.
export function pdfText(s: string): string {
  return s
    .replace(/[‐‑‒−]/g, "-")
    .replace(/[   ]/g, " ")
    .replace(/[^\x00-\xff‘’“”–—•…]/g, "");
}

export function buildPdfData(info: AuditBasicInfo, report: AiReport | null, now = new Date()): PdfData {
  const host = new URL(info.finalUrl).hostname.replace(/^www\./, "");
  const { overall, categories } = computeScores(info.checks);
  const counts = countStatuses(info.checks);
  const isoDate = now.toISOString().slice(0, 10);

  const fixes = report
    ? report.fixes.map((f) => ({ title: pdfText(f.title), detail: pdfText(f.detail) }))
    : topReasons(info.checks).map((r) => ({ title: pdfText(r.reason), detail: pdfText(r.message) }));

  const m = info.speed.mobile ?? info.speed.desktop;
  const speed =
    info.speed.mobile || info.speed.desktop
      ? {
          mobile: info.speed.mobile?.score ?? null,
          desktop: info.speed.desktop?.score ?? null,
          rows: [
            { label: "Loading time (LCP)", value: m?.lcpMs != null ? `${(m.lcpMs / 1000).toFixed(1)} s` : "no data" },
            { label: "Layout shift (CLS)", value: m?.cls != null ? m.cls.toFixed(2) : "no data" },
            { label: "Tap response (INP)", value: m?.inpMs != null ? `${Math.round(m.inpMs)} ms` : "not enough real-user data" },
          ],
        }
      : null;

  return {
    fileName: `leadleak-audit-${host}-${isoDate}.pdf`,
    host,
    url: info.finalUrl,
    dateLabel: now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
    siteTypeNote:
      info.siteType === "contractor"
        ? null
        : "LeadLeak is built for contractor and home-service websites; some checks don't apply to this site and are not scored.",
    overall,
    bandLabel: overall === null ? "" : BAND_LABEL[scoreBand(overall)],
    categories: categories.map((c) => ({ label: c.label, score: c.score, ...(c.category === "speed" && { note: SPEED_NOTE }) })),
    preparedBy: info.preparedBy ?? null,
    counts: { errors: counts.error, warnings: counts.warning, notices: counts.notice, passed: counts.passed },
    summary: report ? pdfText(report.summary) : null,
    fixes,
    fixesHeading: report ? "What to fix first" : "Top reasons you're losing leads",
    issues: rankIssues(info.checks)
      .slice(0, MAX_ISSUES)
      .map((c) => ({
        status: c.status as PdfIssue["status"],
        title: pdfText(c.title),
        category: CATEGORY_LABELS[c.category],
        message: pdfText(c.message),
        impact: c.impact,
      })),
    speed,
    speedNote: speed ? null : info.speed.error ? `Speed couldn't be measured: ${pdfText(info.speed.error)}` : "Speed couldn't be measured.",
    passed: info.checks.filter((c) => c.status === "passed").map((c) => pdfText(c.title)),
    pagesChecked: info.pagesCrawled,
    limits: [
      "Name, address and phone are checked only inside the website (not Google Business Profile or Yelp).",
      "Review signals are found on the site itself; Google review counts are not included.",
      `Up to 20 pages were checked (${info.pagesCrawled} this time). Content that loads later with JavaScript may be missed.`,
    ],
  };
}
