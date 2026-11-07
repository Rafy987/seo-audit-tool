"use client";

import { useMemo, useState } from "react";
import type { AuditBasicInfo } from "@/app/api/audit/route";
import type { CheckResult, CheckStatus } from "@/lib/checks/types";
import { CATEGORY_LABELS, computeScores, countStatuses, rankIssues, scoreBand, topReasons, type CategoryScore, type RankedIssue } from "@/lib/score";
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

  return (
    <div className="mt-6 space-y-4">
      <SiteTypeBanner info={info} />
      <SummaryBar info={info} />

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <section className="rounded-md border border-line bg-panel p-4">
          <HealthRing score={scores.overall} />
          <StatusCounts counts={counts} />
        </section>
        <TopReasons reasons={reasons} />
      </div>

      <CategoryCards categories={scores.categories} />
      <IssuesList issues={issues} />
      <CollapsedList title="Passed checks" checks={info.checks.filter((c) => c.status === "passed")} />
      <CollapsedList title="Not applicable" checks={info.checks.filter((c) => c.status === "na")} />
    </div>
  );
}

/* ---------- Pieces ---------- */

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

function SummaryBar({ info }: { info: AuditBasicInfo }) {
  const host = new URL(info.finalUrl).hostname.replace(/^www\./, "");
  const facts = [
    `${info.pagesCrawled} page${info.pagesCrawled === 1 ? "" : "s"} checked`,
    info.sitemapFound ? "sitemap found" : "no sitemap",
    `homepage ${(info.loadMs / 1000).toFixed(1)} s`,
    `${(info.bytes / 1024).toFixed(0)} KB HTML`,
  ];
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-2">
      <h2 className="text-base font-semibold text-ink">
        Audit: <span className="break-all">{host}</span>
      </h2>
      <p className="text-[11px] text-muted">{facts.join(" · ")}</p>
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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {categories.map((c) => {
        const band = c.score === null ? null : scoreBand(c.score);
        const issues = c.counts.error + c.counts.warning + c.counts.notice;
        return (
          <section key={c.category} className="rounded-md border border-line bg-panel p-3">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted">{c.label}</h3>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${band ? BAND_TEXT[band] : "text-muted"}`}>
              {c.score ?? "N/A"}
              {c.score !== null && <span className="text-xs font-normal text-muted"> /100</span>}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-page" aria-hidden>
              <div className={`h-full ${band ? BAND_BAR[band] : ""}`} style={{ width: `${c.score ?? 0}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-muted">
              {c.score === null ? "Doesn't apply to this site" : issues === 0 ? "No issues" : `${issues} issue${issues === 1 ? "" : "s"}`}
              {c.weight > 0 && ` · ${Math.round(c.weight * 100)}% of score`}
            </p>
          </section>
        );
      })}
    </div>
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
