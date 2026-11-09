import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMessages, buildReportFacts, generateReport, parseReport, plainEnglish, ReportError, reviewReport, sanitizeReportInput, type ReportInput } from "./aiReport";
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

describe("reviewReport", () => {
  const facts = JSON.stringify(buildReportFacts(input));
  const r = (summary: string, detail = "Fix it so more people call you.") => ({ summary, fixes: [{ title: "Do this", detail }] });

  it("passes a clean report that only uses numbers from the facts", () => {
    expect(reviewReport(r("Your site is losing leads because your phone isn't tappable.", "Mobile speed is 44 out of 100; aim for 90 so more people call you."), facts)).toEqual([]);
  });
  it("flags jargon and made-up numbers (the bugs seen in the first live test)", () => {
    const problems = reviewReport(r("Your site is losing leads because LCP is slow. Minify CSS.", "Raise the speed score above 80."), facts);
    expect(problems[0]).toContain("LCP");
    expect(problems[0]).toContain("minify");
    expect(problems.join(" ")).toContain("80");
  });
  it("flags a fix for something that already passed (live bug: 'Add tap-to-call' when the phone was tappable)", () => {
    const okPhone = { ...input, checks: [...input.checks.filter((c) => c.id !== "click-to-call"), check("click-to-call", "passed", { title: "Click-to-call phone link" })] };
    const f = JSON.stringify(buildReportFacts(okPhone));
    const problems = reviewReport(r("Your site is losing leads because the phone number isn't easy to call.", "Add a tap-to-call button."), f);
    expect(problems.join(" ")).toContain("already work on the site");
    // ...but it's fine to mention the phone when click-to-call is actually failing
    expect(reviewReport(r("Your site is losing leads because the phone isn't tappable.", "Add tap-to-call."), facts)).toEqual([]);
  });
  it("checks the opening sentence matches the site type", () => {
    const shopFacts = JSON.stringify(buildReportFacts({ ...input, siteType: "ecommerce" }));
    expect(reviewReport(r("Your site is losing leads because the phone is hidden."), shopFacts)[0]).toContain("could be getting more customers");
    expect(reviewReport(r("Your site could be getting more customers because the phone is hidden."), shopFacts)).toEqual([]);
  });
});

describe("plainEnglish", () => {
  it("swaps the jargon seen in live reports for plain words", () => {
    expect(plainEnglish("Add telephone to schema and alt text to all images.")).toBe("Add telephone to business details code and photo descriptions to all images.");
    expect(plainEnglish("Include it in the LocalBusiness structured data.")).toBe("Include it in the business details code.");
    expect(plainEnglish("Add telephone to business schema.")).toBe("Add telephone to business details code.");
    expect(plainEnglish("Add telephone to business business details code.")).toBe("Add telephone to business details code.");
    expect(plainEnglish("Add an H1 heading. Optimizing scripts helps LCP.")).toBe("Add a main heading. Improving scripts helps loading time.");
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
  it("asks for one rewrite when the report uses jargon", async () => {
    const bad = JSON.stringify({ summary: "Your site is losing leads because LCP is slow.", fixes: [{ title: "Fix LCP", detail: "Minify scripts." }] });
    const good = JSON.stringify({ summary: "Your site is losing leads because it shows up slowly on phones.", fixes: [{ title: "Shrink big photos", detail: "Smaller photos load faster." }] });
    const fetchMock = vi.fn().mockReturnValueOnce(groqReply(bad)).mockReturnValueOnce(groqReply(good));
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateReport(input, "k");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.fixes[0].title).toBe("Shrink big photos");
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retryBody.messages.at(-1).content).toContain("Don't use these words");
  });
  it("fails cleanly without a key, or on rate limit", async () => {
    await expect(generateReport(input, undefined)).rejects.toThrow(/isn't set up/);
    vi.stubGlobal("fetch", vi.fn(() => groqReply("", 429)));
    await expect(generateReport(input, "k")).rejects.toThrow(/limit/);
  });
});

describe("wording rules from user feedback", () => {
  const facts = JSON.stringify(buildReportFacts(input));
  const r = (detail: string) => ({ summary: "Your site is losing leads because it is slow.", fixes: [{ title: "Speed up the site", detail }] });

  it("flags 'computer' and odd phrases like 'waiting for a call'", () => {
    const problems = reviewReport(r("Your computer score is low; this keeps visitors waiting for a call."), facts).join(" ");
    expect(problems).toContain("computer");
    expect(problems).toContain("waiting for a call");
  });
  it("requires every fix to say how it gets more calls or quote requests", () => {
    expect(reviewReport(r("Smaller photos load faster."), facts).join(" ")).toContain("how it gets more calls");
    expect(reviewReport(r("Smaller photos load faster, so more people request a quote."), facts)).toEqual([]);
  });
  it("cleanup turns 'computer' into 'desktop'", () => {
    expect(plainEnglish("Your computer score is 67. It is slow on a computer.")).toBe("Your desktop score is 67. It is slow on desktop.");
  });
});
