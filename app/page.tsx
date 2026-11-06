import AuditForm from "@/components/AuditForm";

const checks = [
  {
    title: "Lead capture",
    text: "Click-to-call phone links, a quote form that's easy to fill, and a \"Free estimate\" button visible without scrolling.",
  },
  {
    title: "Local SEO",
    text: "LocalBusiness schema, city and service pages, and the same name, address and phone on every page.",
  },
  {
    title: "Trust signals",
    text: "Reviews, license number, \"licensed & insured\", warranty and project photos homeowners look for before calling.",
  },
  {
    title: "Speed & on-page",
    text: "Mobile load time, Core Web Vitals, titles, headings and meta descriptions.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Find out why your website isn&apos;t getting more calls
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Enter a contractor&apos;s website. LeadLeak checks the things that turn visitors into
        phone calls and quote requests, and shows what to fix first.
      </p>

      <section className="mt-6 rounded-md border border-line bg-panel p-4 sm:p-5">
        <AuditForm />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
          What the audit checks
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {checks.map((c) => (
            <div key={c.title} className="rounded-md border border-line bg-panel p-4">
              <h3 className="font-semibold text-ink">{c.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{c.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
