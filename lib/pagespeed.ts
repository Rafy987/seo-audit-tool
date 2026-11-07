// Google PageSpeed Insights (free API). Parsing is a pure function (tested with
// sample JSON); fetching is a thin wrapper around it.
// Docs: https://developers.google.com/speed/docs/insights/v5/get-started

export type Strategy = "mobile" | "desktop";
export type Source = "field" | "lab"; // field = real Chrome users (CrUX), lab = Lighthouse test

export type PsiMetrics = {
  strategy: Strategy;
  score: number | null; // Lighthouse performance score 0-100
  lcpMs: number | null;
  lcpSource: Source;
  cls: number | null;
  clsSource: Source;
  inpMs: number | null; // only exists in field data
};

export type SpeedResult = {
  mobile: PsiMetrics | null;
  desktop: PsiMetrics | null;
  error?: string; // why speed couldn't be measured (shown to the user)
};

export class PsiError extends Error {}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === "object" && v !== null ? (v as Json) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Turn a PSI API response into the few numbers we need.
export function parsePsi(json: unknown, strategy: Strategy): PsiMetrics {
  const root = obj(json);
  const apiError = obj(root.error);
  if (apiError.message) throw new PsiError(friendlyError(num(apiError.code), String(apiError.message)));

  const lh = obj(root.lighthouseResult);
  const runtime = obj(lh.runtimeError);
  if (runtime.code && runtime.code !== "NO_ERROR") throw new PsiError("Google couldn't load the page to test its speed.");

  const audits = obj(lh.audits);
  const audit = (id: string) => num(obj(audits[id]).numericValue);
  const perf = num(obj(obj(lh.categories).performance).score);

  // Field data from real Chrome users, if the site has enough traffic.
  const field = obj(obj(root.loadingExperience).metrics);
  const fieldValue = (key: string) => num(obj(field[key]).percentile);
  const fieldLcp = fieldValue("LARGEST_CONTENTFUL_PAINT_MS");
  const fieldCls = fieldValue("CUMULATIVE_LAYOUT_SHIFT_SCORE"); // reported x100 (5 = 0.05)
  const fieldInp = fieldValue("INTERACTION_TO_NEXT_PAINT");

  const labLcp = audit("largest-contentful-paint");
  const labCls = audit("cumulative-layout-shift");
  if (perf === null && labLcp === null && fieldLcp === null) throw new PsiError("Google returned no speed data for this page.");

  return {
    strategy,
    score: perf === null ? null : Math.round(perf * 100),
    lcpMs: fieldLcp ?? labLcp,
    lcpSource: fieldLcp !== null ? "field" : "lab",
    cls: fieldCls !== null ? fieldCls / 100 : labCls,
    clsSource: fieldCls !== null ? "field" : "lab",
    inpMs: fieldInp,
  };
}

function friendlyError(code: number | null, message: string): string {
  if (code === 429 || /quota/i.test(message)) return "Google's free speed-test limit was reached. Try again later.";
  if (code === 400) return "Google couldn't test this page's speed.";
  if (code === 403) return "The speed test API key isn't allowed to call PageSpeed Insights.";
  return "Google's speed test failed.";
}

const API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const TIMEOUT_MS = 40_000; // PSI often takes 15-30 s

export async function fetchPsi(url: string, strategy: Strategy, apiKey?: string): Promise<PsiMetrics> {
  const params = new URLSearchParams({ url, strategy, category: "performance" });
  if (apiKey) params.set("key", apiKey); // works without a key, but the shared quota runs out fast

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}?${params}`, { signal: controller.signal, cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok && !obj(json).error) throw new PsiError(friendlyError(res.status, ""));
    return parsePsi(json, strategy);
  } catch (err) {
    if (err instanceof PsiError) throw err;
    if (controller.signal.aborted) throw new PsiError("Google's speed test took too long.");
    throw new PsiError("Couldn't reach Google's speed test.");
  } finally {
    clearTimeout(timer);
  }
}

// Mobile + desktop in parallel. Never throws: failures become `error`.
export async function measureSpeed(url: string, apiKey = process.env.PAGESPEED_API_KEY): Promise<SpeedResult> {
  const [mobile, desktop] = await Promise.allSettled([fetchPsi(url, "mobile", apiKey), fetchPsi(url, "desktop", apiKey)]);
  const value = (r: PromiseSettledResult<PsiMetrics>) => (r.status === "fulfilled" ? r.value : null);
  const firstError = [mobile, desktop].find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
  const result: SpeedResult = { mobile: value(mobile), desktop: value(desktop) };
  if (!result.mobile && !result.desktop) {
    result.error = firstError?.reason instanceof PsiError ? firstError.reason.message : "Google's speed test failed.";
  }
  return result;
}
