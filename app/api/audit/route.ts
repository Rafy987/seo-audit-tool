import { fetchPage, FetchPageError } from "@/lib/fetchPage";

// Shape of the JSON this route returns (the form imports this type).
export type AuditBasicInfo = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  loadMs: number;
  bytes: number;
  redirects: number;
  title: string | null;
};

function extractTitle(html: string): string | null {
  // Simple regex for now; Phase 3 switches to cheerio.
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match?.[1].replace(/\s+/g, " ").trim();
  return title || null;
}

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
    const info: AuditBasicInfo = {
      requestedUrl: page.requestedUrl,
      finalUrl: page.finalUrl,
      status: page.status,
      loadMs: page.loadMs,
      bytes: page.bytes,
      redirects: page.redirects,
      title: extractTitle(page.html),
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
