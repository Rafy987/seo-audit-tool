import { normalizeUrl } from "@/lib/url";
import { measureSpeed, type SpeedResult } from "@/lib/pagespeed";
import { MemoryCache } from "@/lib/memoryCache";
import { clientIp, limits, tooMany } from "@/lib/rateLimit";

// Google PageSpeed test on its own route, called by the dashboard after the audit
// is already on screen. It gets the full time budget (PSI often takes 30-50 s).
export const maxDuration = 60;

// Same URL tested in the last 6 hours on this server instance: reuse the result.
const cache = new MemoryCache<SpeedResult>(6 * 60 * 60 * 1000, 100);

export async function POST(request: Request) {
  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const check = typeof url === "string" ? normalizeUrl(url) : null;
  if (!check?.ok) return Response.json({ error: "Invalid website address." }, { status: 400 });

  const cached = cache.get(check.url);
  if (cached) return Response.json(cached);

  const perIp = limits.speedPerIp.check(clientIp(request.headers));
  if (!perIp.ok) return tooMany("speed tests", perIp.retryAfterSec);
  const daily = limits.speedDaily.check("all");
  if (!daily.ok) return tooMany("speed tests today", daily.retryAfterSec);

  const speed = await measureSpeed(check.url);
  // Only cache complete results (mobile AND desktop), so a timeout can be retried right away.
  if (speed.mobile && speed.desktop) cache.set(check.url, speed);
  return Response.json(speed);
}
