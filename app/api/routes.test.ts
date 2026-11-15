import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the slow / paid parts, so these tests run offline and instantly.
vi.mock("@/lib/pagespeed", () => ({ measureSpeed: vi.fn() }));
vi.mock("@/lib/aiReport", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/aiReport")>();
  return { ...real, generateReport: vi.fn() };
});

import { measureSpeed } from "@/lib/pagespeed";
import { generateReport, ReportError } from "@/lib/aiReport";
import { POST as speedPOST } from "./speed/route";
import { POST as reportPOST } from "./report/route";

const post = (body: unknown, ip: string) =>
  new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });

const goodSpeed = {
  mobile: { strategy: "mobile", score: 42, lcpMs: 3000, lcpSource: "lab", cls: 0.1, clsSource: "lab", inpMs: null },
  desktop: { strategy: "desktop", score: 80, lcpMs: 1200, lcpSource: "lab", cls: 0.01, clsSource: "lab", inpMs: null },
};
const halfSpeed = { ...goodSpeed, desktop: null, failed: { desktop: "took too long" } };
const failedSpeed = { mobile: null, desktop: null, error: "Google's speed test took too long.", failed: { mobile: "took too long" } };

describe("/api/speed", () => {
  // Braces matter: a function returned from beforeEach is run as cleanup after the test.
  beforeEach(() => {
    vi.mocked(measureSpeed).mockReset();
  });

  it("rejects a bad URL", async () => {
    const res = await speedPOST(post({ url: "not a url" }, "1.1.1.1"));
    expect(res.status).toBe(400);
  });

  it("caches a good result: the second request doesn't call Google again", async () => {
    vi.mocked(measureSpeed).mockResolvedValue(goodSpeed as never);
    const a = await (await speedPOST(post({ url: "cache-test.com" }, "1.1.1.2"))).json();
    const b = await (await speedPOST(post({ url: "https://cache-test.com/" }, "1.1.1.3"))).json();
    expect(a.mobile.score).toBe(42);
    expect(b).toEqual(a);
    expect(measureSpeed).toHaveBeenCalledTimes(1);
  });

  it("does NOT cache a failed test, so Retry really runs it again", async () => {
    vi.mocked(measureSpeed).mockResolvedValueOnce(failedSpeed as never).mockResolvedValueOnce(goodSpeed as never);
    const first = await (await speedPOST(post({ url: "retry-test.com" }, "1.1.1.4"))).json();
    const retry = await (await speedPOST(post({ url: "retry-test.com" }, "1.1.1.4"))).json();
    expect(first.error).toContain("took too long");
    expect(retry.mobile.score).toBe(42);
    expect(measureSpeed).toHaveBeenCalledTimes(2);
  });

  it("limits each visitor to 15 speed tests an hour, with a friendly 429", async () => {
    vi.mocked(measureSpeed).mockResolvedValue(failedSpeed as never); // failures aren't cached, so every call counts
    for (let i = 0; i < 15; i++) await speedPOST(post({ url: `limit-${i}.com` }, "9.9.9.9"));
    const res = await speedPOST(post({ url: "limit-16.com" }, "9.9.9.9"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect((await res.json()).error).toContain("Please try again in");
  });
});

describe("/api/report", () => {
  const body = {
    site: "https://abcflooring.com/",
    siteType: "contractor",
    checks: [{ id: "license", category: "trust", status: "warning", title: "License number", message: "No license number.", weight: 6 }],
    speed: null,
  };
  const report = { summary: "Your site is losing leads because...", fixes: [{ title: "Show your license", detail: "So more homeowners call you." }] };

  beforeEach(() => {
    vi.mocked(generateReport).mockReset();
  });

  it("reuses the report for exactly the same audit data", async () => {
    vi.mocked(generateReport).mockResolvedValue(report);
    const a = await (await reportPOST(post(body, "2.2.2.1"))).json();
    const b = await (await reportPOST(post(body, "2.2.2.2"))).json();
    expect(a.report).toEqual(report);
    expect(b.report).toEqual(report);
    expect(generateReport).toHaveBeenCalledTimes(1);
  });

  it("returns a clean error message when the AI fails", async () => {
    vi.mocked(generateReport).mockImplementation(async () => {
      throw new ReportError("The free AI limit was reached. Try again in a minute.");
    });
    const res = await reportPOST(post({ ...body, site: "https://other.com/" }, "2.2.2.3"));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("free AI limit");
  });
});

describe("/api/speed partial results", () => {
  it("doesn't cache a half result (mobile only), so the next audit tries desktop again", async () => {
    vi.mocked(measureSpeed).mockReset();
    vi.mocked(measureSpeed).mockResolvedValue(halfSpeed as never);
    await speedPOST(post({ url: "half-test.com" }, "3.3.3.1"));
    await speedPOST(post({ url: "half-test.com" }, "3.3.3.1"));
    expect(measureSpeed).toHaveBeenCalledTimes(2);
  });
});
