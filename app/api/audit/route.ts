import { fetchPage, FetchPageError } from "@/lib/fetchPage";
import { crawlSite } from "@/lib/crawl";
import { runOnPageChecks } from "@/lib/checks/onPage";
import { runLeadCaptureChecks } from "@/lib/checks/leadCapture";
import { runLocalSeoChecks } from "@/lib/checks/localSeo";
import { runTrustChecks } from "@/lib/checks/trust";
import { applySiteType } from "@/lib/checks/applicability";
import { detectSiteType, type SiteType } from "@/lib/siteType";
import type { SpeedResult } from "@/lib/pagespeed";
import { getPreparedBy, type PreparedBy } from "@/lib/preparedBy";
import { clientIp, limits, tooMany } from "@/lib/rateLimit";
import type { CheckResult } from "@/lib/checks/types";

// Homepage (≤10 s) + crawl (≤25 s). The speed test runs separately in /api/speed.
export const maxDuration = 60;

// Shape of the JSON this route returns (the form imports this type).
export type AuditBasicInfo = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  loadMs: number;
  bytes: number;
  redirects: number;
  title: string | null;
  pagesCrawled: number;
  sitemapFound: boolean;
  siteType: SiteType;
  siteTypeSignals: string[];
  speed: SpeedResult | null; // null until the dashboard gets it from /api/speed
  preparedBy: PreparedBy | null; // for the PDF, from .env.local
  checks: CheckResult[];
};

export async function POST(request: Request) {
  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof url !== "string") {
    return Response.json({ error: "Enter the website address you want to audit." }, { status: 400 });
  }

  const limit = limits.auditPerIp.check(clientIp(request.headers));
  if (!limit.ok) return tooMany("audits", limit.retryAfterSec);

  try {
    const page = await fetchPage(url);
    const crawl = await crawlSite({ url: page.finalUrl, html: page.html });
    const site = detectSiteType(crawl.pages);

    const checks = applySiteType(
      [
        ...runLeadCaptureChecks(page.html),
        ...runLocalSeoChecks(crawl),
        ...runTrustChecks(crawl),
        ...runOnPageChecks(page.html, page.finalUrl),
      ],
      site.type,
    );
    const info: AuditBasicInfo = {
      requestedUrl: page.requestedUrl,
      finalUrl: page.finalUrl,
      status: page.status,
      loadMs: page.loadMs,
      bytes: page.bytes,
      redirects: page.redirects,
      title: checks.find((c) => c.id === "title")?.value ?? null,
      pagesCrawled: crawl.pages.length,
      sitemapFound: crawl.sitemapFound,
      siteType: site.type,
      siteTypeSignals: site.signals,
      speed: null,
      preparedBy: getPreparedBy(),
      checks,
    };
    return Response.json(info);
  } catch (err) {
    if (err instanceof FetchPageError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    // Log a short line only (no request body, no keys).
    console.error("audit route:", err instanceof Error ? `${err.name}: ${err.message}` : "unknown error");
    return Response.json({ error: "Something went wrong on our side. Try again." }, { status: 500 });
  }
}
