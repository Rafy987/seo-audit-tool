import { afterEach, describe, expect, it, vi } from "vitest";
import { measureSpeed, parsePsi, PsiError } from "./pagespeed";
import { buildSpeedChecks } from "./checks/speed";

// Trimmed PSI v5 responses (same shape as the real API, only the fields we read).
const lab = (score: number, lcp: number, cls: number) => ({
  lighthouseResult: {
    categories: { performance: { score } },
    audits: {
      "largest-contentful-paint": { numericValue: lcp },
      "cumulative-layout-shift": { numericValue: cls },
    },
  },
});
const withField = {
  ...lab(0.42, 7100, 0.02),
  loadingExperience: {
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3900, category: "AVERAGE" },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 31, category: "SLOW" }, // = 0.31
      INTERACTION_TO_NEXT_PAINT: { percentile: 640, category: "SLOW" },
    },
  },
};

describe("parsePsi", () => {
  it("prefers real-user (field) data when it exists", () => {
    const m = parsePsi(withField, "mobile");
    expect(m).toEqual({ strategy: "mobile", score: 42, lcpMs: 3900, lcpSource: "field", cls: 0.31, clsSource: "field", inpMs: 640 });
  });
  it("falls back to lab data, with no INP", () => {
    const m = parsePsi({ ...lab(0.93, 1800, 0.05), loadingExperience: { id: "x" } }, "desktop");
    expect(m).toMatchObject({ score: 93, lcpMs: 1800, lcpSource: "lab", cls: 0.05, inpMs: null });
  });
  it("turns a quota error into a friendly message", () => {
    expect(() => parsePsi({ error: { code: 429, message: "Quota exceeded for quota metric 'Queries'" } }, "mobile")).toThrow(
      /free speed-test limit/,
    );
  });
  it("reports pages Google couldn't load", () => {
    const json = { lighthouseResult: { runtimeError: { code: "FAILED_DOCUMENT_REQUEST" } } };
    expect(() => parsePsi(json, "mobile")).toThrow(PsiError);
  });
});

describe("measureSpeed (fetch mocked, no network)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

  it("runs mobile + desktop and sends the API key", async () => {
    const fetchMock = vi.fn((url: string) => reply(url.includes("strategy=mobile") ? withField : lab(0.88, 2100, 0.01)));
    vi.stubGlobal("fetch", fetchMock);
    const r = await measureSpeed("https://abcflooring.com/", "test-key");
    expect(r.mobile?.score).toBe(42);
    expect(r.desktop?.score).toBe(88);
    expect(r.error).toBeUndefined();
    expect(fetchMock.mock.calls.every(([u]) => String(u).includes("key=test-key"))).toBe(true);
  });
  it("never throws: both failing gives an error message", async () => {
    vi.stubGlobal("fetch", vi.fn(() => reply({ error: { code: 429, message: "Quota exceeded" } }, 429)));
    const r = await measureSpeed("https://abcflooring.com/", undefined);
    expect(r).toEqual({ mobile: null, desktop: null, error: "Google's free speed-test limit was reached. Try again later." });
  });
});

describe("buildSpeedChecks", () => {
  const ids = (checks: ReturnType<typeof buildSpeedChecks>) => Object.fromEntries(checks.map((c) => [c.id, c.status]));

  it("grades with Google's limits", () => {
    const mobile = parsePsi(withField, "mobile"); // 42, LCP 3.9 s, CLS 0.31, INP 640
    const desktop = parsePsi(lab(0.95, 1200, 0.01), "desktop");
    expect(ids(buildSpeedChecks({ mobile, desktop }))).toEqual({
      "speed-mobile": "error",
      "speed-desktop": "passed",
      lcp: "warning",
      cls: "error",
      inp: "error",
    });
  });
  it("writes the loading time in seconds for a contractor", () => {
    const lcp = buildSpeedChecks({ mobile: parsePsi(lab(0.3, 6200, 0), "mobile"), desktop: null }).find((c) => c.id === "lcp")!;
    expect(lcp.message).toContain("6.2 s");
    expect(lcp.message).toContain("phone");
  });
  it("gives INP a Notice when there's no real-user data", () => {
    const checks = buildSpeedChecks({ mobile: parsePsi(lab(0.9, 2000, 0), "mobile"), desktop: null });
    expect(checks.find((c) => c.id === "inp")?.status).toBe("notice");
    expect(checks.find((c) => c.id === "speed-desktop")?.status).toBe("na");
  });
  it("marks every speed check N/A when the test failed", () => {
    const checks = buildSpeedChecks({ mobile: null, desktop: null, error: "Google's speed test took too long." });
    expect(checks.every((c) => c.status === "na" && c.category === "speed")).toBe(true);
    expect(checks[0].message).toContain("took too long");
  });
});
