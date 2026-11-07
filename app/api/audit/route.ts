import { fetchPage, FetchPageError } from "@/lib/fetchPage";
import { runOnPageChecks } from "@/lib/checks/onPage";
import type { CheckResult } from "@/lib/checks/types";

// Shape of the JSON this route returns (the form imports this type).
export type AuditBasicInfo = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  loadMs: number;
  bytes: number;
  redirects: number;
  title: string | null;
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
    const checks = runOnPageChecks(page.html, page.finalUrl);
    const info: AuditBasicInfo = {
      requestedUrl: page.requestedUrl,
      finalUrl: page.finalUrl,
      status: page.status,
      loadMs: page.loadMs,
      bytes: page.bytes,
      redirects: page.redirects,
      title: checks.find((c) => c.id === "title")?.value ?? null,
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
