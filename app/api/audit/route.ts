import { fetchPage, FetchPageError } from "@/lib/fetchPage";
import { crawlSite } from "@/lib/crawl";
import { runOnPageChecks } from "@/lib/checks/onPage";
import { runLeadCaptureChecks } from "@/lib/checks/leadCapture";
import { runLocalSeoChecks } from "@/lib/checks/localSeo";
import type { CheckResult } from "@/lib/checks/types";

// Homepage (≤10 s) + mini crawl (≤25 s). Tells Vercel this route may run up to 60 s.
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
    const crawl = await crawlSite({ url: page.finalUrl, html: page.html });

    const checks = [
      ...runLeadCaptureChecks(page.html),
      ...runLocalSeoChecks(crawl),
      ...runOnPageChecks(page.html, page.finalUrl),
    ];
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
