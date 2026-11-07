import { describe, expect, it } from "vitest";
import type { CheckCategory, CheckResult, CheckStatus } from "./checks/types";
import { computeScores, countStatuses, rankIssues, reasonFor, scoreBand, scoreChecks, topReasons } from "./score";

const c = (id: string, category: CheckCategory, status: CheckStatus, weight = 10): CheckResult => ({
  id,
  category,
  status,
  weight,
  title: id,
  message: `${id} message`,
});

describe("scoreChecks", () => {
  it("gives 100 when everything passes and 0 when everything fails", () => {
    expect(scoreChecks([c("a", "trust", "passed"), c("b", "trust", "passed")])).toBe(100);
    expect(scoreChecks([c("a", "trust", "error"), c("b", "trust", "error")])).toBe(0);
  });
  it("weights checks: a heavy failure hurts more than a light one", () => {
    const heavyFail = scoreChecks([c("a", "trust", "error", 9), c("b", "trust", "passed", 1)]);
    const lightFail = scoreChecks([c("a", "trust", "error", 1), c("b", "trust", "passed", 9)]);
    expect(heavyFail).toBe(10);
    expect(lightFail).toBe(90);
  });
  it("scores notice 75% and warning 40%", () => {
    expect(scoreChecks([c("a", "trust", "notice")])).toBe(75);
    expect(scoreChecks([c("a", "trust", "warning")])).toBe(40);
  });
  it("ignores N/A checks, and returns null if everything is N/A", () => {
    expect(scoreChecks([c("a", "trust", "passed"), c("b", "trust", "na")])).toBe(100);
    expect(scoreChecks([c("a", "trust", "na")])).toBeNull();
  });
});

describe("computeScores", () => {
  it("weights categories: lead capture counts the most", () => {
    const leadFails = computeScores([c("a", "lead-capture", "error"), c("b", "on-page", "passed")]);
    const onPageFails = computeScores([c("a", "lead-capture", "passed"), c("b", "on-page", "error")]);
    expect(leadFails.overall!).toBeLessThan(onPageFails.overall!);
  });
  it("gives the full 4-category weights when all are present", () => {
    const r = computeScores([
      c("a", "lead-capture", "passed"),
      c("b", "local-seo", "error"),
      c("d", "trust", "error"),
      c("e", "on-page", "error"),
    ]);
    expect(r.overall).toBe(35);
    expect(r.categories.map((x) => x.weight)).toEqual([0.35, 0.25, 0.2, 0.2]);
  });
  it("shares out the weight of a category that is all N/A", () => {
    const r = computeScores([c("a", "lead-capture", "passed"), c("b", "trust", "na"), c("d", "on-page", "error")]);
    const trust = r.categories.find((x) => x.category === "trust")!;
    expect(trust.score).toBeNull();
    expect(trust.weight).toBe(0);
    // lead 0.35 and on-page 0.2 -> 0.35/0.55 of 100
    expect(r.overall).toBe(64);
  });
  it("returns null overall when nothing can be scored", () => {
    expect(computeScores([c("a", "trust", "na")]).overall).toBeNull();
  });
});

describe("countStatuses", () => {
  it("counts each status", () => {
    const r = countStatuses([c("a", "trust", "error"), c("b", "trust", "error"), c("d", "trust", "na")]);
    expect(r).toEqual({ error: 2, warning: 0, notice: 0, passed: 0, na: 1 });
  });
});

describe("rankIssues", () => {
  it("sorts by points lost, skips passed and N/A", () => {
    const r = rankIssues([
      c("onpage-error", "on-page", "error", 10),
      c("lead-error", "lead-capture", "error", 10),
      c("lead-notice", "lead-capture", "notice", 2),
      c("ok", "trust", "passed"),
      c("skip", "trust", "na"),
    ]);
    expect(r.map((x) => x.id)).toEqual(["lead-error", "onpage-error", "lead-notice"]);
    expect(r.every((x) => x.impact > 0)).toBe(true);
  });
  it("impact adds up to the points missing from the Health Score", () => {
    const checks = [c("a", "lead-capture", "error"), c("b", "local-seo", "warning"), c("d", "trust", "passed"), c("e", "on-page", "notice")];
    const lost = rankIssues(checks).reduce((s, x) => s + x.impact, 0);
    expect(Math.round(100 - lost)).toBe(computeScores(checks).overall);
  });
});

describe("topReasons", () => {
  it("returns the 3 biggest errors/warnings with contractor wording", () => {
    const r = topReasons([
      c("click-to-call", "lead-capture", "error", 10),
      c("license", "trust", "warning", 6),
      c("title", "on-page", "warning", 8),
      c("cta-above-fold", "lead-capture", "error", 8),
      c("rating-schema", "trust", "notice", 2),
    ]);
    expect(r).toHaveLength(3);
    expect(r[0].reason).toBe("Your phone number isn't clickable on mobile");
    expect(r.map((x) => x.id)).not.toContain("rating-schema");
  });
  it("falls back to the check title", () => {
    expect(reasonFor(c("something-new", "trust", "warning"))).toBe("something-new");
  });
});

describe("scoreBand", () => {
  it("splits at 50 and 80", () => {
    expect([0, 49, 50, 79, 80, 100].map(scoreBand)).toEqual(["poor", "poor", "fair", "fair", "good", "good"]);
  });
});
