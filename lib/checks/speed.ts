import type { PsiMetrics, Source, SpeedResult } from "../pagespeed";
import type { CheckResult, CheckStatus } from "./types";

// Speed checks built from PageSpeed Insights numbers. Pure function, no network.
// Thresholds are Google's own "good / needs improvement / poor" limits.

function result(r: Omit<CheckResult, "category">): CheckResult {
  return { category: "speed", ...r };
}

export const LIMITS = {
  score: { good: 90, ok: 50 }, // higher is better
  lcpMs: { good: 2500, ok: 4000 }, // lower is better
  cls: { good: 0.1, ok: 0.25 },
  inpMs: { good: 200, ok: 500 },
};

type Limit = { good: number; ok: number };
export const higherIsBetter = (v: number, l: Limit): CheckStatus => (v >= l.good ? "passed" : v >= l.ok ? "warning" : "error");
export const lowerIsBetter = (v: number, l: Limit): CheckStatus => (v <= l.good ? "passed" : v <= l.ok ? "warning" : "error");

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const sourceNote = (s: Source, device: string) => (s === "field" ? `real Chrome users on ${device}` : `Google's ${device} test`);

const IDS = ["speed-mobile", "speed-desktop", "lcp", "cls", "inp"] as const;
const TITLES: Record<(typeof IDS)[number], string> = {
  "speed-mobile": "Mobile speed score",
  "speed-desktop": "Desktop speed score",
  lcp: "Loading time (LCP)",
  cls: "Layout shift (CLS)",
  inp: "Tap response (INP)",
};
const WEIGHTS: Record<(typeof IDS)[number], number> = { "speed-mobile": 10, "speed-desktop": 4, lcp: 8, cls: 5, inp: 4 };

function scoreCheck(m: PsiMetrics | null, id: "speed-mobile" | "speed-desktop"): CheckResult {
  const device = id === "speed-mobile" ? "phones" : "computers";
  const base = { id, title: TITLES[id], weight: WEIGHTS[id] };
  if (!m || m.score === null) {
    return result({ ...base, status: "na", message: `The ${id === "speed-mobile" ? "mobile" : "desktop"} speed test didn't return a score this time.` });
  }
  const status = higherIsBetter(m.score, LIMITS.score);
  const value = `${m.score}/100`;
  const messages: Record<CheckStatus, string> = {
    passed: `Fast on ${device}: ${m.score}/100.`,
    warning: `Speed score on ${device} is ${m.score}/100. ${id === "speed-mobile" ? "Most homeowners browse on their phone, and a slow site loses calls." : "Room to improve."}`,
    error: `Speed score on ${device} is only ${m.score}/100. ${id === "speed-mobile" ? "Many visitors on phones will leave before your page finishes loading." : "The site is slow even on a computer."}`,
    notice: "",
    na: "",
  };
  return result({ ...base, status, value, message: messages[status] });
}

export function buildSpeedChecks(speed: SpeedResult | null): CheckResult[] {
  // Nothing measured: all speed checks are N/A, so they don't affect the score.
  if (!speed || (!speed.mobile && !speed.desktop)) {
    const why = speed?.error ?? "The speed test didn't run.";
    return IDS.map((id) => result({ id, title: TITLES[id], weight: WEIGHTS[id], status: "na", message: `Speed couldn't be measured this time. ${why}` }));
  }

  // Core Web Vitals: use mobile numbers (what Google ranks on), else desktop.
  const m = speed.mobile ?? speed.desktop!;
  const device = m.strategy === "mobile" ? "a phone" : "a computer";
  const checks: CheckResult[] = [scoreCheck(speed.mobile, "speed-mobile"), scoreCheck(speed.desktop, "speed-desktop")];

  // LCP
  {
    const base = { id: "lcp", title: TITLES.lcp, weight: WEIGHTS.lcp };
    if (m.lcpMs === null) checks.push(result({ ...base, status: "na", message: "No loading time was reported." }));
    else {
      const status = lowerIsBetter(m.lcpMs, LIMITS.lcpMs);
      const t = secs(m.lcpMs);
      const src = sourceNote(m.lcpSource, m.strategy);
      checks.push(
        result({
          ...base,
          status,
          value: t,
          message:
            status === "passed"
              ? `The main content shows in ${t} on ${device} (${src}). Good.`
              : `Your page takes ${t} to show its main content on ${device} (${src}). Aim for under 2.5 s: compress large photos and remove heavy sliders or videos at the top.`,
        }),
      );
    }
  }

  // CLS
  {
    const base = { id: "cls", title: TITLES.cls, weight: WEIGHTS.cls };
    if (m.cls === null) checks.push(result({ ...base, status: "na", message: "No layout shift value was reported." }));
    else {
      const status = lowerIsBetter(m.cls, LIMITS.cls);
      const v = m.cls.toFixed(2);
      checks.push(
        result({
          ...base,
          status,
          value: v,
          message:
            status === "passed"
              ? `The page stays steady while it loads (CLS ${v}).`
              : `The page jumps around while loading (CLS ${v}), so visitors can tap the wrong button. Give images and banners a fixed size.`,
        }),
      );
    }
  }

  // INP (only in real-user field data)
  {
    const base = { id: "inp", title: TITLES.inp, weight: WEIGHTS.inp };
    if (m.inpMs === null) {
      checks.push(result({ ...base, status: "notice", message: "Not enough real-user data yet. Google needs more Chrome visitors to measure how fast buttons respond on this site." }));
    } else {
      const status = lowerIsBetter(m.inpMs, LIMITS.inpMs);
      const v = `${Math.round(m.inpMs)} ms`;
      checks.push(
        result({
          ...base,
          status,
          value: v,
          message:
            status === "passed"
              ? `Buttons and menus respond quickly (${v}).`
              : `Buttons and menus react slowly when tapped (${v}). Heavy scripts like chat widgets and trackers are the usual cause.`,
        }),
      );
    }
  }

  return checks;
}
