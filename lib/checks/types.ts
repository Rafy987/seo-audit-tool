// Shared shape for every audit check (on-page, lead capture, local SEO, ...).

// "na" = not applicable (e.g. a contractor-only check on an online store).
// It is shown in grey and not counted in the score.
export type CheckStatus = "error" | "warning" | "notice" | "passed" | "na";

export type CheckCategory = "on-page" | "lead-capture" | "local-seo" | "trust" | "speed";

export type CheckResult = {
  id: string; // stable key, e.g. "title"
  category: CheckCategory;
  title: string; // short name shown in the list
  status: CheckStatus;
  message: string; // plain-English explanation for a contractor
  weight: number; // importance, used for the score in Phase 7
  value?: string; // what we found (e.g. the title text), if useful
};
