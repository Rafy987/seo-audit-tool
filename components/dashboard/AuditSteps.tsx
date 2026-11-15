// Real progress steps: each step is an actual request (site scan, speed test, report).

export type StepState = "waiting" | "active" | "done" | "failed";
export type Step = { label: string; state: StepState; note?: string; onRetry?: () => void };

const DOT: Record<StepState, string> = {
  waiting: "border-line bg-panel",
  active: "border-brand bg-brand-soft animate-pulse",
  done: "border-passed bg-passed",
  failed: "border-error bg-error",
};
const TEXT: Record<StepState, string> = { waiting: "Waiting", active: "In progress", done: "Done", failed: "Failed" };

export default function AuditSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid gap-2 rounded-md border border-line bg-panel px-4 py-3 sm:grid-cols-3" aria-label="Audit progress">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-start gap-2.5" aria-current={s.state === "active" ? "step" : undefined}>
          <span className={`mt-0.5 h-3 w-3 shrink-0 rounded-full border-2 ${DOT[s.state]}`} aria-hidden />
          <div className="min-w-0 text-xs">
            <p className={`font-semibold ${s.state === "waiting" ? "text-muted" : "text-ink"}`}>
              {i + 1}. {s.label}
            </p>
            <p className={`text-[11px] ${s.state === "failed" ? "text-error" : "text-muted"}`}>
              {s.note ?? TEXT[s.state]}
              {s.onRetry && (
                <button type="button" onClick={s.onRetry} className="ml-2 font-semibold text-brand hover:underline">
                  Retry
                </button>
              )}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
