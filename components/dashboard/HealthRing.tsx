import { scoreBand } from "@/lib/score";
import { BAND_LABEL, BAND_TEXT } from "./status";

// Circular 0-100 score. Plain SVG: a grey track and a colored arc (no gradients).
export default function HealthRing({ score, size = 136 }: { score: number | null; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const value = score ?? 0;
  const band = score === null ? null : scoreBand(score);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-line" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="butt"
            stroke="currentColor"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - value / 100)}
            className={band ? BAND_TEXT[band] : "text-line"}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-semibold tabular-nums leading-none text-ink">{score ?? "–"}</span>
          <span className="mt-1 text-[11px] text-muted">of 100</span>
        </div>
      </div>
      <p className="mt-2 text-xs font-semibold text-ink">Health Score</p>
      {band && <p className={`text-[11px] font-medium ${BAND_TEXT[band]}`}>{BAND_LABEL[band]}</p>}
      <span className="sr-only">Health Score {score ?? "not available"} out of 100</span>
    </div>
  );
}
