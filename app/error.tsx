"use client"; // Error boundaries must be Client Components

import Link from "next/link";

// Shown if something crashes while rendering a page. In Next.js 16 the
// function to try again is called `retry` (it used to be `reset`).
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-md border border-line bg-panel p-6">
        <h1 className="text-lg font-semibold text-ink">Something went wrong on this page</h1>
        <p className="mt-2 text-sm text-muted">
          The audit tool hit an unexpected problem. Try again, or reload the page.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => retry()}
            className="h-9 rounded bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            Try again
          </button>
          <Link href="/" className="flex h-9 items-center rounded border border-line px-4 text-sm font-semibold text-ink hover:border-brand hover:text-brand">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
