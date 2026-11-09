import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMessages, buildReportFacts, generateReport, parseReport, ReportError, sanitizeReportInput, type ReportInput } from "./aiReport";
import type { CheckResult } from "./checks/types";

const check = (id: string, status: CheckResult["status"], extra: Partial<CheckResult> = {}): CheckResult => ({
  id,
  category: "lead-capture",
  status,
  title: id,
  message: `${id} message`,
  weight: 8,
  ...extra,
});

const input: ReportInput = {
  site: "https://abcflooring.com/",
  siteType: "contractor",
  checks: [
    check("click-to-call", "error", { title: "Click-to-call phone link", message: "Your phone number (408) 555-0123 isn't clickable on mobile.", value: "(408) 555-0123" }),
    check("license", "warning", { category: "trust", title: "License number" }),
    check("rating-schema", "notice", { category: "trust" }),
    check("title", "passed", { category: "on-page", title: "Page title" }),
    check("badges", "na", { category: "trust" }),
  ],
  speed: { mobile: { strategy: "mobile", score: 44, lcpMs: 3600, lcpSource: "lab", cls: 0.27, clsSource: "lab", inpMs: null }, desktop: null },
};

describe("buildReportFacts", () => {
  it("sends only a compact summary: errors/warnings, strengths, scores, speed", () => {
    const f = buildReportFacts(input);
    expect(f.biggestProblems.map((p) => p.problem)).toEqual(["Click-to-call phone link", "License number"]);
    expect(f.biggestProblems[0].found).toBe("(408) 555-0123");
    expect(f.alreadyGood).toEqual(["Page title"]);
    expect(f.mobileSpeed).toEqual({ score: 44, loadingSeconds: 3.6 });
    expect(typeof f.healthScore).toBe("number");
  });
  it("never includes N/A or notice checks as problems", () => {
    const ids = JSON.stringify(buildReportFacts(input));
    expect(ids).not.toContain("badges");
    expect(ids).not.toContain("rating-schema");
  });
  it("keeps the prompt small", () => {
    const many = { ...input, checks: Array.from({ length: 40 }, (_, i) => check(`c${i}`, "error", { message: "x".repeat(2000) })) };
    const user = buildMessages(many)[1].content;
    expect(buildReportFacts(many).biggestProblems).toHaveLength(8);
    expect(user.length).toBeLessThan(4000);
  });
});

describe("buildMessages", () => {
  it("tells the model to use only our facts and start with the lead-loss sentence", () => {
    const [system, user] = buildMessages(input);
    expect(system.content).toContain("Use ONLY the facts");
    expect(system.content).toContain("Your site is losing leads because");
    expect(JSON.parse(user.content).website).toBe("https://abcflooring.com/");
  });
});

describe("parseReport", () => {
  it("accepts a valid report and limits to 5 fixes", () => {
    const fixes = Array.from({ length: 7 }, (_, i) => ({ title: `Fix ${i}`, detail: "Do it." }));
    const r = parseReport(JSON.stringify({ summary: "Your site is losing leads because...", fixes }));
    expect(r.fixes).toHaveLength(5);
  });
  it("rejects broken or incomplete JSON", () => {
    expect(() => parseReport("not json")).toThrow(ReportError);
    expect(() => parseReport(JSON.stringify({ summary: "Hi", fixes: [] }))).toThrow(/incomplete/);
  });
});

describe("sanitizeReportInput", () => {
  it("keeps known fields and cuts long text", () => {
    const r = sanitizeReportInput({ ...input, checks: [{ ...input.checks[0], message: "y".repeat(5000), extra: "dropped" }] });
    expect(r?.checks[0].message).toHaveLength(400);
    expect(r?.checks[0]).not.toHaveProperty("extra");
  });
  it("rejects bad data", () => {
    expect(sanitizeReportInput(null)).toBeNull();
    expect(sanitizeReportInput({ site: "x", checks: [{ id: "a", status: "hacked", category: "trust" }] })).toBeNull();
    expect(sanitizeReportInput({ site: "x", checks: Array(81).fill(input.checks[0]) })).toBeNull();
  });
});

describe("generateReport (fetch mocked, no network)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const groqReply = (content: string, status = 200) =>
    Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }));

  it("calls Groq with the key, JSON mode and our messages", async () => {
    const good = JSON.stringify({ summary: "Your site is losing leads because the phone isn't tappable.", fixes: [{ title: "Make your phone tap-to-call", detail: "Wrap it in a tel: link." }] });
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => groqReply(good));
    vi.stubGlobal("fetch", fetchMock);

    const r = await generateReport(input, "test-key", "openai/gpt-oss-20b");
    expect(r.fixes[0].title).toBe("Make your phone tap-to-call");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.max_completion_tokens).toBeGreaterThan(0);
    expect(body.messages[0].role).toBe("system");
  });
  it("fails cleanly without a key, or on rate limit", async () => {
    await expect(generateReport(input, undefined)).rejects.toThrow(/isn't set up/);
    vi.stubGlobal("fetch", vi.fn(() => groqReply("", 429)));
    await expect(generateReport(input, "k")).rejects.toThrow(/limit/);
  });
});
