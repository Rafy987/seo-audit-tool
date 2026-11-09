"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuditBasicInfo } from "@/app/api/audit/route";
import type { ReportResponse } from "@/app/api/report/route";
import type { AiReport } from "@/lib/aiReport";
import { SPEED_NOTE } from "@/lib/pdfData";
import type { CheckResult, CheckStatus } from "@/lib/checks/types";
import { CATEGORY_LABELS, computeScores, countStatuses, rankIssues, scoreBand, topReasons, type CategoryScore, type RankedIssue } from "@/lib/score";
import type { PsiMetrics, SpeedResult } from "@/lib/pagespeed";
import { higherIsBetter, LIMITS, lowerIsBetter } from "@/lib/checks/speed";
import HealthRing from "./HealthRing";
import { BAND_BAR, BAND_TEXT, STATUS } from "./status";

type Filter = "all" | "error" | "warning" | "notice";

export default function AuditDashboard({ info }: { info: AuditBasicInfo }) {
  // useMemo: recompute only when the result changes, not on every filter click.
  const { scores, counts, issues, reasons } = useMemo(
    () => ({
      scores: computeScores(info.checks),
      counts: countStatuses(info.checks),
      issues: rankIssues(info.checks),
      reasons: topReasons(info.checks),
    }),
    [info.checks],
  );

  // The AI report lives here so both the Summary panel and the PDF use it.
  const report = useAiReport(info);

  return (
    <div className="mt-6 space-y-4">
      <SiteTypeBanner info={info} />
      <SummaryBar info={info} report={report} />
      <WrittenSummary state={report} />

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <section className="rounded-md border border-line bg-panel p-4">
          <HealthRing score={scores.overall} />
          <StatusCounts counts={counts} />
        </section>
        <TopReasons reasons={reasons} />
      </div>

      <CategoryCards categories={scores.categories} />
      <SpeedPanel speed={info.speed} />
      <IssuesList issues={issues} />
      <CollapsedList title="Passed checks" checks={info.checks.filter((c) => c.status === "passed")} />
      <CollapsedList title="Not applicable" checks={info.checks.filter((c) => c.status === "na")} />
    </div>
  );
}

/* ---------- Pieces ---------- */

type ReportState = { status: "loading" } | { status: "done"; report: AiReport } | { status: "failed"; error: string };

// Custom hook: asks /api/report for the AI-written report once the dashboard is on
// screen. A custom hook is just a function starting with "use" that uses other hooks.
function useAiReport(info: AuditBasicInfo): ReportState {
  const [state, setState] = useState<ReportState>({ status: "loading" });

  useEffect(() => {
    // No reset needed here: a new audit unmounts this dashboard, so state starts at "loading".
    const controller = new AbortController();
    fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: info.finalUrl, siteType: info.siteType, checks: info.checks, speed: info.speed }),
      signal: controller.signal,
    })
      .then((res) => res.json() as Promise<ReportResponse>)
      .then((data) => setState("report" in data ? { status: "done", report: data.report } : { status: "failed", error: data.error }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "failed", error: "The written report isn't available right now." });
      });
    // Cleanup: cancel the request if a new audit starts before this one finishes.
    return () => controller.abort();
  }, [info]);

  return state;
}

// Plain-English report written by the AI. If it fails, the rule-based Top reasons still show.
function WrittenSummary({ state }: { state: ReportState }) {
  if (state.status === "failed") {
    return <p className="text-[11px] text-muted">Written summary unavailable ({state.error}) The top reasons below are still accurate.</p>;
  }

  return (
    <section className="rounded-md border border-line bg-panel" aria-busy={state.status === "loading"}>
      <h3 className="border-b border-line px-4 py-2.5 text-xs font-semibold text-ink">Summary</h3>
      {state.status === "loading" ? (
        <div className="space-y-2 px-4 py-4" role="status">
          <p className="text-xs text-muted">Writing your report…</p>
          <div className="h-2.5 w-11/12 animate-pulse rounded bg-page" />
          <div className="h-2.5 w-3/4 animate-pulse rounded bg-page" />
        </div>
      ) : (
        <div className="px-4 py-3">
          <p className="text-sm leading-relaxed text-ink">{state.report.summary}</p>
          <h4 className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">What to fix first</h4>
          <ol className="mt-1.5 space-y-2">
            {state.report.fixes.map((f, i) => (
              <li key={i} className="flex gap-2.5 text-xs">
                <span className="mt-px w-4 shrink-0 text-right font-semibold tabular-nums text-brand">{i + 1}.</span>
                <span>
                  <span className="font-semibold text-ink">{f.title}.</span> <span className="text-muted">{f.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function SiteTypeBanner({ info }: { info: AuditBasicInfo }) {
  if (info.siteType === "contractor") return null;
  const lead = info.siteType === "ecommerce" ? "This looks like an online store" : "This doesn't look like a contractor or home-service business";
  return (
    <div role="note" className="rounded-md border border-line bg-panel px-4 py-3 text-xs">
      <p className="font-semibold text-ink">LeadLeak is built for contractor and home-service websites; some checks don&apos;t apply.</p>
      <p className="mt-1 text-muted">
        {lead}
        {info.siteTypeSignals.length > 0 ? ` (${info.siteTypeSignals.slice(0, 3).join(", ")})` : ""}. Contractor-only checks are marked
        N/A and don&apos;t count toward the score.
      </p>
    </div>
  );
}

function SummaryBar({ info, report }: { info: AuditBasicInfo; report: ReportState }) {
  const host = new URL(info.finalUrl).hostname.replace(/^www\./, "");
  const facts = [
    `${info.pagesCrawled} page${info.pagesCrawled === 1 ? "" : "s"} checked`,
    info.sitemapFound ? "sitemap found" : "no sitemap",
    `homepage ${(info.loadMs / 1000).toFixed(1)} s`,
    `${(info.bytes / 1024).toFixed(0)} KB HTML`,
  ];
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-2">
      <div>
        <h2 className="text-base font-semibold text-ink">
          Audit: <span className="break-all">{host}</span>
        </h2>
        <p className="text-[11px] text-muted">{facts.join(" · ")}</p>
      </div>
      <DownloadPdfButton info={info} report={report} />
    </div>
  );
}

// Builds the PDF in the browser. The PDF library is only downloaded when the
// button is clicked, thanks to dynamic import(), so the page stays light.
function DownloadPdfButton({ info, report }: { info: AuditBasicInfo; report: ReportState }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const waitingForReport = report.status === "loading";

  async function download() {
    setBusy(true);
    setFailed(false);
    try {
      const [{ pdf }, { default: AuditPdf }, { buildPdfData }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/pdf/AuditPdf"),
        import("@/lib/pdfData"),
      ]);
      const data = buildPdfData(info, report.status === "done" ? report.report : null);
      const blob = await pdf(<AuditPdf data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      console.error(err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {failed && <span className="text-[11px] text-error">Couldn&apos;t create the PDF. Try again.</span>}
      <button
        type="button"
        onClick={download}
        disabled={busy || waitingForReport}
        title={waitingForReport ? "Waiting for the written summary…" : undefined}
        className="h-8 rounded border border-line bg-panel px-3 text-xs font-semibold text-ink transition-colors hover:border-brand hover:text-brand disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "Preparing PDF…" : waitingForReport ? "Preparing summary…" : "Download PDF"}
      </button>
    </div>
  );
}

function StatusCounts({ counts }: { counts: Record<CheckStatus, number> }) {
  const order: CheckStatus[] = ["error", "warning", "notice", "passed"];
  return (
    <dl className="mt-4 grid grid-cols-4 gap-1 border-t border-line pt-3 text-center md:grid-cols-2 md:gap-2">
      {order.map((s) => (
        <div key={s}>
          <dt className="text-[10px] uppercase tracking-wide text-muted">{STATUS[s].plural}</dt>
          <dd className={`text-lg font-semibold tabular-nums ${counts[s] > 0 && s !== "passed" ? STATUS[s].text : "text-ink"}`}>{counts[s]}</dd>
        </div>
      ))}
    </dl>
  );
}

function TopReasons({ reasons }: { reasons: (RankedIssue & { reason: string })[] }) {
  return (
    <section className="rounded-md border border-line bg-panel">
      <h3 className="border-b border-line px-4 py-2.5 text-xs font-semibold text-ink">Top reasons you&apos;re losing leads</h3>
      {reasons.length === 0 ? (
        <p className="px-4 py-4 text-xs text-muted">No major problems found. The issues below are small improvements.</p>
      ) : (
        <ol className="divide-y divide-line">
          {reasons.map((r, i) => (
            <li key={r.id} className="flex gap-3 px-4 py-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-brand text-[11px] font-semibold text-white">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug text-ink">{r.reason}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{r.message}</p>
                <p className="mt-1 text-[11px] text-muted">
                  <span className={STATUS[r.status].text}>{STATUS[r.status].label}</span> · {CATEGORY_LABELS[r.category]} · costs about{" "}
                  {r.impact} {r.impact === 1 ? "point" : "points"}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function CategoryCards({ categories }: { categories: CategoryScore[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {categories.map((c) => {
        const band = c.score === null ? null : scoreBand(c.score);
        const issues = c.counts.error + c.counts.warning + c.counts.notice;
        return (
          <section key={c.category} className="rounded-md border border-line bg-panel p-3">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted">
              {c.label}
              {c.category === "speed" && <span className="ml-1 font-normal normal-case tracking-normal text-muted/80">({SPEED_NOTE})</span>}
            </h3>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${band ? BAND_TEXT[band] : "text-muted"}`}>
              {c.score ?? "N/A"}
              {c.score !== null && <span className="text-xs font-normal text-muted"> /100</span>}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-page" aria-hidden>
              <div className={`h-full ${band ? BAND_BAR[band] : ""}`} style={{ width: `${c.score ?? 0}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-muted">
              {c.score === null
                ? c.category === "speed"
                  ? "Not measured this time"
                  : "Doesn't apply to this site"
                : issues === 0
                  ? "No issues"
                  : `${issues} issue${issues === 1 ? "" : "s"}`}
              {c.weight > 0 && ` · ${Math.round(c.weight * 100)}% of score`}
            </p>
          </section>
        );
      })}
    </div>
  );
}

// Mobile + desktop speed side by side, with Core Web Vitals for each.
function SpeedPanel({ speed }: { speed: SpeedResult }) {
  if (!speed.mobile && !speed.desktop) {
    return (
      <section className="rounded-md border border-line bg-panel px-4 py-3 text-xs">
        <span className="font-semibold text-ink">Speed couldn&apos;t be measured this time.</span>{" "}
        <span className="text-muted">{speed.error} Speed checks are left out of the score.</span>
      </section>
    );
  }

  const status = (v: number | null, l: { good: number; ok: number }, higher = false): CheckStatus | null =>
    v === null ? null : higher ? higherIsBetter(v, l) : lowerIsBetter(v, l);

  const rows = [
    { label: "Loading time (LCP)", get: (m: PsiMetrics) => m.lcpMs, fmt: (v: number) => `${(v / 1000).toFixed(1)} s`, limits: LIMITS.lcpMs, src: (m: PsiMetrics) => m.lcpSource },
    { label: "Layout shift (CLS)", get: (m: PsiMetrics) => m.cls, fmt: (v: number) => v.toFixed(2), limits: LIMITS.cls, src: (m: PsiMetrics) => m.clsSource },
    { label: "Tap response (INP)", get: (m: PsiMetrics) => m.inpMs, fmt: (v: number) => `${Math.round(v)} ms`, limits: LIMITS.inpMs, src: () => "field" as const },
  ];

  return (
    <section className="overflow-hidden rounded-md border border-line bg-panel">
      <h3 className="border-b border-line px-4 py-2.5 text-xs font-semibold text-ink">Speed (Google PageSpeed Insights)</h3>
      <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {([speed.mobile, speed.desktop] as const).map((m, i) => {
          const device = i === 0 ? "Mobile" : "Desktop";
          const s = m ? status(m.score, LIMITS.score, true) : null;
          return (
            <div key={device} className="px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{device}</span>
                <span className={`text-xl font-semibold tabular-nums ${s ? STATUS[s].text : "text-muted"}`}>
                  {m?.score ?? "–"}
                  <span className="text-xs font-normal text-muted"> /100</span>
                </span>
              </div>
              <dl className="mt-2 divide-y divide-line text-xs">
                {rows.map((r) => {
                  const v = m ? r.get(m) : null;
                  const st = status(v, r.limits);
                  return (
                    <div key={r.label} className="flex items-center justify-between gap-2 py-1.5">
                      <dt className="text-muted">{r.label}</dt>
                      <dd className="flex items-center gap-2">
                        {v !== null && m && <span className="text-[10px] text-muted/80">{r.src(m) === "field" ? "real users" : "lab test"}</span>}
                        <span className={`font-medium tabular-nums ${st ? STATUS[st].text : "text-muted"}`}>{v === null ? "no data" : r.fmt(v)}</span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function IssuesList({ issues }: { issues: RankedIssue[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? issues : issues.filter((i) => i.status === filter);
  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: issues.length },
    ...(["error", "warning", "notice"] as const).map((s) => ({ key: s, label: STATUS[s].plural, count: issues.filter((i) => i.status === s).length })),
  ];

  return (
    <section className="overflow-hidden rounded-md border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <h3 className="text-xs font-semibold text-ink">Issues, by impact</h3>
        <div role="tablist" aria-label="Filter issues" className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={filter === t.key}
              onClick={() => setFilter(t.key)}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                filter === t.key ? "bg-topbar text-topbar-text" : "text-muted hover:bg-page hover:text-ink"
              }`}
            >
              {t.label} <span className="tabular-nums opacity-70">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="px-4 py-4 text-xs text-muted">Nothing here.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((i) => (
            <IssueRow key={i.id} check={i} impact={i.impact} />
          ))}
        </ul>
      )}
    </section>
  );
}

function IssueRow({ check, impact }: { check: CheckResult; impact?: number }) {
  const s = STATUS[check.status];
  return (
    <li className="flex gap-3 px-4 py-2.5">
      <span className={`mt-0.5 w-1 shrink-0 rounded-full ${s.bar}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${s.badge}`}>{s.label}</span>
          <span className="text-xs font-semibold text-ink">{check.title}</span>
          <span className="text-[10px] text-muted">{CATEGORY_LABELS[check.category]}</span>
          {impact !== undefined && impact > 0 && (
            <span className="ml-auto text-[10px] tabular-nums text-muted" title="Points this costs the Health Score">
              −{impact} {impact === 1 ? "pt" : "pts"}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{check.message}</p>
        {check.value && check.status !== "passed" && <p className="mt-1 truncate text-[11px] text-muted/80">Found: {check.value}</p>}
      </div>
    </li>
  );
}

// <details> is a native HTML collapsible: no state needed.
function CollapsedList({ title, checks }: { title: string; checks: CheckResult[] }) {
  if (checks.length === 0) return null;
  return (
    <details className="group overflow-hidden rounded-md border border-line bg-panel">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-xs font-semibold text-ink hover:bg-page">
        <span>
          {title} <span className="font-normal tabular-nums text-muted">{checks.length}</span>
        </span>
        <span className="text-muted transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
      </summary>
      <ul className="divide-y divide-line border-t border-line">
        {checks.map((c) => (
          <IssueRow key={c.id} check={c} />
        ))}
      </ul>
    </details>
  );
}
