import type { CheckStatus } from "@/lib/checks/types";
import type { ScoreBand } from "@/lib/score";

// Status -> label + Tailwind classes (colors come from the tokens in globals.css).
export const STATUS: Record<CheckStatus, { label: string; plural: string; badge: string; bar: string; text: string }> = {
  error: { label: "Error", plural: "Errors", badge: "bg-error-soft text-error", bar: "bg-error", text: "text-error" },
  warning: { label: "Warning", plural: "Warnings", badge: "bg-warning-soft text-warning", bar: "bg-warning", text: "text-warning" },
  notice: { label: "Notice", plural: "Notices", badge: "bg-notice-soft text-notice", bar: "bg-notice", text: "text-notice" },
  passed: { label: "Passed", plural: "Passed", badge: "bg-passed-soft text-passed", bar: "bg-passed", text: "text-passed" },
  na: { label: "N/A", plural: "Not applicable", badge: "bg-page text-muted", bar: "bg-line", text: "text-muted" },
};

export const BAND_TEXT: Record<ScoreBand, string> = { poor: "text-error", fair: "text-warning", good: "text-passed" };
export const BAND_BAR: Record<ScoreBand, string> = { poor: "bg-error", fair: "bg-warning", good: "bg-passed" };
export const BAND_LABEL: Record<ScoreBand, string> = { poor: "Losing leads", fair: "Needs work", good: "In good shape" };
