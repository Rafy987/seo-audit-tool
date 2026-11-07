"use client";

import { useState } from "react";
import { normalizeUrl } from "@/lib/url";
import type { AuditBasicInfo } from "@/app/api/audit/route";
import type { CheckCategory, CheckResult, CheckStatus } from "@/lib/checks/types";

// Status -> label + Tailwind classes (colors come from globals.css tokens).
const STATUS: Record<CheckStatus, { label: string; badge: string; bar: string }> = {
  error: { label: "Error", badge: "bg-error-soft text-error", bar: "bg-error" },
  warning: { label: "Warning", badge: "bg-warning-soft text-warning", bar: "bg-warning" },
  notice: { label: "Notice", badge: "bg-notice-soft text-notice", bar: "bg-notice" },
  passed: { label: "Passed", badge: "bg-passed-soft text-passed", bar: "bg-passed" },
};
const ORDER: CheckStatus[] = ["error", "warning", "notice", "passed"];

const CATEGORIES: { key: CheckCategory; label: string }[] = [
  { key: "lead-capture", label: "Lead capture" },
  { key: "local-seo", label: "Local SEO" },
  { key: "trust", label: "Trust signals" },
  { key: "on-page", label: "On-page SEO" },
  { key: "speed", label: "Speed" },
];

// One CheckList per category that has results, in a fixed order.
function CheckGroups({ checks }: { checks: CheckResult[] }) {
  return CATEGORIES.map(({ key, label }) => {
    const list = checks.filter((c) => c.category === key);
    return list.length > 0 ? <CheckList key={key} title={label} checks={list} /> : null;
  });
}

function CheckList({ title, checks }: { title: string; checks: CheckResult[] }) {
  const sorted = [...checks].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const counts = ORDER.map((s) => [s, checks.filter((c) => c.status === s).length] as const);

  return (
    <div className="mt-4 overflow-hidden rounded border border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-page px-3 py-2">
        <span className="text-xs font-semibold text-ink">{title}</span>
        <div className="flex gap-1.5">
          {counts.map(([s, n]) => (
            <span key={s} className={`rounded px-2 py-0.5 text-[11px] font-medium ${STATUS[s].badge}`}>
              {n} {STATUS[s].label}
            </span>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-line">
        {sorted.map((c) => (
          <li key={c.id} className="flex gap-3 px-3 py-2.5">
            <span className={`mt-0.5 w-1 shrink-0 rounded-full ${STATUS[c.status].bar}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink">{c.title}</span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS[c.status].badge}`}>
                  {STATUS[c.status].label}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{c.message}</p>
              {c.value && c.status !== "passed" && (
                <p className="mt-1 truncate text-[11px] text-muted/80">Found: {c.value}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AuditForm() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditBasicInfo | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const check = normalizeUrl(value);

    if (!check.ok) {
      setError(check.error);
      setResult(null);
      return;
    }

    setError(null);
    setResult(null);
    setValue(check.url);
    setLoading(true);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: check.url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
      } else {
        setResult(data as AuditBasicInfo);
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="site-url" className="mb-1.5 block text-xs font-medium text-muted">
          Contractor website
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="site-url"
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="abcroofing.com"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={loading}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "site-url-error" : undefined}
            className={`h-10 flex-1 rounded border bg-panel px-3 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60 ${
              error ? "border-error" : "border-line"
            }`}
          />
          <button
            type="submit"
            disabled={loading}
            className="h-10 rounded bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? "Scanning..." : "Run audit"}
          </button>
        </div>

        {loading && (
          <p className="mt-2 text-xs text-muted" role="status">
            Fetching the homepage and checking up to 20 pages. This can take up to 30 seconds.
          </p>
        )}

        {error && (
          <p id="site-url-error" role="alert" className="mt-2 rounded border border-error/30 bg-error-soft px-3 py-2 text-xs text-error">
            {error}
          </p>
        )}
      </form>

      {result && (
        <>
          <BasicInfo info={result} />
          <CheckGroups checks={result.checks} />
        </>
      )}
    </div>
  );
}

function BasicInfo({ info }: { info: AuditBasicInfo }) {
  const rows: [string, string][] = [
    ["Page title", info.title ?? "Missing"],
    ["Final URL", info.finalUrl],
    ["HTTP status", String(info.status)],
    ["Redirects", String(info.redirects)],
    ["Response time", `${(info.loadMs / 1000).toFixed(2)} s`],
    ["HTML size", `${(info.bytes / 1024).toFixed(1)} KB`],
    ["Pages checked", `${info.pagesCrawled}${info.sitemapFound ? " (sitemap found)" : " (no sitemap found)"}`],
  ];

  return (
    <div className="mt-4 overflow-hidden rounded border border-line">
      <div className="flex items-center justify-between border-b border-line bg-page px-3 py-2">
        <span className="text-xs font-semibold text-ink">Page fetched</span>
        <span className="rounded bg-passed-soft px-2 py-0.5 text-[11px] font-medium text-passed">OK</span>
      </div>
      <dl className="divide-y divide-line text-xs">
        {rows.map(([label, val]) => (
          <div key={label} className="grid grid-cols-[110px_1fr] gap-2 px-3 py-2">
            <dt className="text-muted">{label}</dt>
            <dd className={`break-all ${val === "Missing" ? "text-error" : "text-ink"}`}>{val}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
