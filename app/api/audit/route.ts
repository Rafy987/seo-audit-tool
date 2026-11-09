import { fetchPage, FetchPageError } from "@/lib/fetchPage";
import { crawlSite } from "@/lib/crawl";
import { runOnPageChecks } from "@/lib/checks/onPage";
import { runLeadCaptureChecks } from "@/lib/checks/leadCapture";
import { runLocalSeoChecks } from "@/lib/checks/localSeo";
import { runTrustChecks } from "@/lib/checks/trust";
import { applySiteType } from "@/lib/checks/applicability";
import { detectSiteType, type SiteType } from "@/lib/siteType";
import { measureSpeed, type SpeedResult } from "@/lib/pagespeed";
import { buildSpeedChecks } from "@/lib/checks/speed";
import { getPreparedBy, type PreparedBy } from "@/lib/preparedBy";
import type { CheckResult } from "@/lib/checks/types";

// Homepage (≤10 s) + crawl and speed test in parallel (≤40 s). Tells Vercel this route may run up to 60 s.
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
  speed: SpeedResult;
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

  try {
    const page = await fetchPage(url);
    // Crawl (≤25 s) and Google's speed test (≤40 s) run at the same time.
    const [crawl, speed] = await Promise.all([
      crawlSite({ url: page.finalUrl, html: page.html }),
      measureSpeed(page.finalUrl),
    ]);
    const site = detectSiteType(crawl.pages);

    const checks = applySiteType(
      [
        ...runLeadCaptureChecks(page.html),
        ...runLocalSeoChecks(crawl),
        ...runTrustChecks(crawl),
        ...runOnPageChecks(page.html, page.finalUrl),
        ...buildSpeedChecks(speed),
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
      speed,
      preparedBy: getPreparedBy(),
      checks,
    };
    return Response.json(info);
  } catch (err) {
    if (err instanceof FetchPageError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return Response.json({ error: "Something went wrong on our side. Try again." }, { status: 500 });
  }
}
