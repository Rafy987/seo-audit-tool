"use client";

import { useState } from "react";
import { normalizeUrl } from "@/lib/url";

export default function AuditForm() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submittedUrl, setSubmittedUrl] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = normalizeUrl(value);

    if (!result.ok) {
      setError(result.error);
      setSubmittedUrl(null);
      return;
    }

    setError(null);
    setValue(result.url);
    setSubmittedUrl(result.url);
    // Phase 2: call /api/audit here.
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full">
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
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "site-url-error" : undefined}
          className={`h-10 flex-1 rounded border bg-panel px-3 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/20 ${
            error ? "border-error" : "border-line"
          }`}
        />
        <button
          type="submit"
          className="h-10 rounded bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand/40"
        >
          Run audit
        </button>
      </div>

      {error && (
        <p id="site-url-error" role="alert" className="mt-2 text-xs text-error">
          {error}
        </p>
      )}

      {submittedUrl && (
        <p className="mt-2 rounded border border-notice/30 bg-notice-soft px-3 py-2 text-xs text-notice">
          Ready to audit <span className="font-medium">{submittedUrl}</span>. The scan itself is coming in the next step.
        </p>
      )}
    </form>
  );
}
