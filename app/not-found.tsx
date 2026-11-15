import Link from "next/link";

// Shown for any URL that doesn't exist.
export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-md border border-line bg-panel p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">404</p>
        <h1 className="mt-1 text-lg font-semibold text-ink">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-sm text-muted">The link may be broken or the page was moved.</p>
        <Link
          href="/"
          className="mt-4 inline-flex h-9 items-center rounded bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Run a free audit
        </Link>
      </div>
    </div>
  );
}
