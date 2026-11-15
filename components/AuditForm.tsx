"use client";

import { useState } from "react";
import { normalizeUrl } from "@/lib/url";
import type { AuditBasicInfo } from "@/app/api/audit/route";
import { getCachedAudit } from "@/lib/auditCache";
import AuditDashboard, { type CachedResult } from "./dashboard/AuditDashboard";
import AuditSteps from "./dashboard/AuditSteps";

type Result = { run: number; info: AuditBasicInfo; cached: CachedResult | null };

// The URL form + the results. `children` is shown until the first result arrives
// (the homepage passes the "What the audit checks" boxes in here).
export default function AuditForm({ children }: { children?: React.ReactNode }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [runs, setRuns] = useState(0); // a new number per audit, so the dashboard starts fresh (key prop)

  async function runAudit(input: string, fresh: boolean) {
    const check = normalizeUrl(input);
    if (!check.ok) {
      setError(check.error);
      setResult(null);
      return;
    }

    setError(null);
    setValue(check.url);
    const run = runs + 1;
    setRuns(run);

    // Same site in the last 24 hours? Show the saved result (no API calls).
    if (!fresh) {
      let hit = null;
      try {
        hit = getCachedAudit(window.localStorage, check.url);
      } catch {
        // storage blocked: just run a new audit
      }
      if (hit) {
        setResult({ run, info: hit.info, cached: { savedAt: hit.savedAt, report: hit.report } });
        return;
      }
    }

    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: check.url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong. Try again.");
      } else {
        setResult({ run, info: data as AuditBasicInfo, cached: null });
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void runAudit(value, false);
  }

  return (
    <div className="w-full">
      <section className="rounded-md border border-line bg-panel p-4 sm:p-5">
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

          {error && (
            <div id="site-url-error" role="alert" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-error/30 bg-error-soft px-3 py-2 text-xs text-error">
              <span>{error}</span>
              {value && (
                <button type="button" onClick={() => void runAudit(value, true)} className="font-semibold underline">
                  Try again
                </button>
              )}
            </div>
          )}
        </form>
      </section>

      {loading && (
        <div className="mt-4">
          <AuditSteps
            steps={[
              { label: "Site scan", state: "active", note: "Homepage + up to 20 pages, about 10-30 s" },
              { label: "Speed test (Google)", state: "waiting" },
              { label: "Written report", state: "waiting" },
            ]}
          />
        </div>
      )}

      {result ? (
        <AuditDashboard key={result.run} info={result.info} cached={result.cached} onRunFresh={() => void runAudit(result.info.finalUrl, true)} />
      ) : (
        !loading && children
      )}
    </div>
  );
}
