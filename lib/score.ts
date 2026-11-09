import type { CheckCategory, CheckResult, CheckStatus } from "./checks/types";

// Scoring: pure functions, no React. The dashboard only displays these numbers.

// How much of a check's weight it earns for each status. "na" isn't scored.
export const STATUS_POINTS: Record<Exclude<CheckStatus, "na">, number> = {
  passed: 1,
  notice: 0.75,
  warning: 0.4,
  error: 0,
};

// How much each category counts toward the Health Score. Lead capture weighs the most.
export const CATEGORY_WEIGHTS: Record<CheckCategory, number> = {
  "lead-capture": 0.3,
  "local-seo": 0.25,
  trust: 0.15,
  "on-page": 0.15,
  speed: 0.15,
};

// Below this many scored checks, a category counts half (see computeScores).
export const MIN_CHECKS_FOR_FULL_WEIGHT = 2;

export const CATEGORY_LABELS: Record<CheckCategory, string> = {
  "lead-capture": "Lead capture",
  "local-seo": "Local SEO",
  trust: "Trust signals",
  "on-page": "On-page SEO",
  speed: "Speed",
};

const scored = (c: CheckResult) => c.status !== "na";
const points = (c: CheckResult) => (c.status === "na" ? 0 : STATUS_POINTS[c.status]);

export type StatusCounts = Record<CheckStatus, number>;

export function countStatuses(checks: CheckResult[]): StatusCounts {
  const counts: StatusCounts = { error: 0, warning: 0, notice: 0, passed: 0, na: 0 };
  for (const c of checks) counts[c.status]++;
  return counts;
}

// 0-100 for a list of checks, or null if none of them can be scored.
export function scoreChecks(checks: CheckResult[]): number | null {
  const list = checks.filter(scored);
  const total = list.reduce((sum, c) => sum + c.weight, 0);
  if (total === 0) return null;
  const earned = list.reduce((sum, c) => sum + c.weight * points(c), 0);
  return Math.round((earned / total) * 100);
}

export type CategoryScore = {
  category: CheckCategory;
  label: string;
  score: number | null; // null = nothing to score (all N/A)
  weight: number; // share of the Health Score after dropping empty categories (0-1)
  counts: StatusCounts;
};

export type Scores = { overall: number | null; categories: CategoryScore[] };

export function computeScores(checks: CheckResult[]): Scores {
  const order = Object.keys(CATEGORY_WEIGHTS) as CheckCategory[];
  const present = order.filter((cat) => checks.some((c) => c.category === cat));

  const raw = present.map((category) => {
    const list = checks.filter((c) => c.category === category);
    const scoredCount = list.filter(scored).length;
    // A category with only 1 scored check (the rest N/A) gets half its weight,
    // so one check can't swing the whole Health Score.
    const base = scoredCount === 0 ? 0 : CATEGORY_WEIGHTS[category] * (scoredCount < MIN_CHECKS_FOR_FULL_WEIGHT ? 0.5 : 1);
    return { category, score: scoreChecks(list), counts: countStatuses(list), base };
  });

  // Categories with nothing to score give their share to the others.
  const totalWeight = raw.reduce((sum, r) => sum + r.base, 0);
  const categories: CategoryScore[] = raw.map(({ base, ...r }) => ({
    ...r,
    label: CATEGORY_LABELS[r.category],
    weight: totalWeight === 0 ? 0 : base / totalWeight,
  }));

  const overall =
    totalWeight === 0 ? null : Math.round(categories.reduce((sum, c) => sum + (c.score ?? 0) * c.weight, 0));
  return { overall, categories };
}

export type RankedIssue = CheckResult & { impact: number };

// Problems (errors, warnings, notices) sorted by how many points they cost the Health Score.
export function rankIssues(checks: CheckResult[]): RankedIssue[] {
  const { categories } = computeScores(checks);
  const catWeight = new Map(categories.map((c) => [c.category, c.weight]));
  const catTotal = new Map(
    categories.map((c) => [
      c.category,
      checks.filter((x) => x.category === c.category && scored(x)).reduce((s, x) => s + x.weight, 0),
    ]),
  );

  return checks
    .filter((c) => c.status === "error" || c.status === "warning" || c.status === "notice")
    .map((c) => {
      const share = (catWeight.get(c.category) ?? 0) * (c.weight / (catTotal.get(c.category) || 1));
      // Points lost on the 0-100 Health Score if this stays unfixed.
      return { ...c, impact: Math.round(share * (1 - points(c)) * 1000) / 10 };
    })
    .sort((a, b) => b.impact - a.impact);
}

// Plain-English headline for each problem, written for a contractor.
const REASONS: Record<string, Partial<Record<CheckStatus, string>>> = {
  "click-to-call": {
    error: "Your phone number isn't clickable on mobile",
    warning: "Your tap-to-call number is buried down the page",
  },
  "cta-above-fold": {
    error: "There's no \"Free Estimate\" button telling visitors what to do",
    warning: "Your \"Get a Quote\" button is below the fold",
  },
  "quote-form": {
    error: "There's no quote form for people who don't want to call",
    warning: "Your quote form asks for too much",
    notice: "Visitors have to click away to find your quote form",
  },
  "local-schema": { error: "Google doesn't have your business details", warning: "Your business details for Google are incomplete" },
  nap: { warning: "Different phone numbers on different pages confuse Google and customers" },
  "service-city-pages": {
    error: "You have no service or city pages, so you don't rank in the towns you serve",
    warning: "You're missing pages for the cities or services you offer",
  },
  "map-service-area": { warning: "Visitors can't tell which areas you serve" },
  reviews: { warning: "There are no reviews on your site to build trust" },
  license: { warning: "Homeowners can't verify your license" },
  insured: { warning: "You never say you're licensed & insured" },
  gallery: { warning: "There are no photos of your past work" },
  warranty: { warning: "No warranty is mentioned, so hiring you feels risky" },
  "robots-meta": { error: "This page is hidden from Google (noindex)" },
  title: { error: "Your page has no title in Google results", warning: "Your page title isn't helping you get clicks from Google" },
  h1: { error: "Your page has no clear main heading", warning: "Your page has more than one main heading" },
  "word-count": { warning: "Your page has too little text for Google to rank it" },
  "img-alt": { warning: "Your photos have no descriptions for Google" },
  links: { warning: "Visitors can't easily reach your other pages" },
  "speed-mobile": { error: "Your site is too slow on phones", warning: "Your site is slow on phones" },
  "speed-desktop": { error: "Your site is slow even on desktop", warning: "Your site could load faster on desktop" },
  lcp: { error: "Your page takes too long to show up on a phone", warning: "Your page is slow to show up on a phone" },
  cls: { error: "Your page jumps around while it loads", warning: "Your page shifts a little while it loads" },
  inp: { error: "Buttons react slowly when tapped", warning: "Buttons are a bit slow to react when tapped" },
};

export function reasonFor(c: CheckResult): string {
  return REASONS[c.id]?.[c.status] ?? c.title;
}

// "Top 3 reasons you're losing leads": the biggest errors/warnings.
export function topReasons(checks: CheckResult[], n = 3): (RankedIssue & { reason: string })[] {
  return rankIssues(checks)
    .filter((c) => c.status === "error" || c.status === "warning")
    .slice(0, n)
    .map((c) => ({ ...c, reason: reasonFor(c) }));
}

export type ScoreBand = "poor" | "fair" | "good";
export const scoreBand = (score: number): ScoreBand => (score >= 80 ? "good" : score >= 50 ? "fair" : "poor");
