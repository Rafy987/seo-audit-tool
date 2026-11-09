import { generateReport, ReportError, sanitizeReportInput, type AiReport } from "@/lib/aiReport";

// Written report for an audit. Called by the dashboard after the audit is shown,
// so the user never waits for the AI before seeing results.
export const maxDuration = 30;

export type ReportResponse = { report: AiReport } | { error: string };

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." } satisfies ReportResponse, { status: 400 });
  }

  const input = sanitizeReportInput(body);
  if (!input) return Response.json({ error: "Invalid audit data." } satisfies ReportResponse, { status: 400 });

  try {
    const report = await generateReport(input);
    return Response.json({ report } satisfies ReportResponse);
  } catch (err) {
    const message = err instanceof ReportError ? err.message : "The written report isn't available right now.";
    if (!(err instanceof ReportError)) console.error(err);
    return Response.json({ error: message } satisfies ReportResponse, { status: 502 });
  }
}
