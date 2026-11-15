import { createHash } from "node:crypto";
import { generateReport, ReportError, sanitizeReportInput, type AiReport } from "@/lib/aiReport";
import { MemoryCache } from "@/lib/memoryCache";
import { clientIp, limits, tooMany } from "@/lib/rateLimit";

// Written report for an audit. Called by the dashboard after the audit (and speed
// test) are shown, so the user never waits for the AI before seeing results.
export const maxDuration = 30;

export type ReportResponse = { report: AiReport } | { error: string };

// Exactly the same audit data in the last 24 hours on this instance: reuse the report.
const cache = new MemoryCache<AiReport>(24 * 60 * 60 * 1000, 200);

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." } satisfies ReportResponse, { status: 400 });
  }

  const input = sanitizeReportInput(body);
  if (!input) return Response.json({ error: "Invalid audit data." } satisfies ReportResponse, { status: 400 });

  // The cache key is a fingerprint (hash) of the cleaned-up input.
  const key = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const cached = cache.get(key);
  if (cached) return Response.json({ report: cached } satisfies ReportResponse);

  const perIp = limits.reportPerIp.check(clientIp(request.headers));
  if (!perIp.ok) return tooMany("written reports", perIp.retryAfterSec);
  const daily = limits.reportDaily.check("all");
  if (!daily.ok) return tooMany("written reports today", daily.retryAfterSec);

  try {
    const report = await generateReport(input);
    cache.set(key, report);
    return Response.json({ report } satisfies ReportResponse);
  } catch (err) {
    const message = err instanceof ReportError ? err.message : "The written report isn't available right now.";
    // Log only our own message type, never the request body or keys.
    if (!(err instanceof ReportError)) console.error("report route:", err instanceof Error ? err.name : "unknown error");
    return Response.json({ error: message } satisfies ReportResponse, { status: 502 });
  }
}
