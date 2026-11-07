"use client";

import { useState } from "react";
import { normalizeUrl } from "@/lib/url";
import type { AuditBasicInfo } from "@/app/api/audit/route";

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

        {error && (
          <p id="site-url-error" role="alert" className="mt-2 rounded border border-error/30 bg-error-soft px-3 py-2 text-xs text-error">
            {error}
          </p>
        )}
      </form>

      {result && <BasicInfo info={result} />}
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
