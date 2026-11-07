import type { SiteType } from "../siteType";
import type { CheckResult } from "./types";

// Checks that only make sense for contractor / home-service websites.
export const CONTRACTOR_ONLY = new Set([
  "cta-above-fold", // "Free estimate / Get a quote" button
  "quote-form",
  "license",
  "insured",
  "warranty",
  "badges", // BBB & trade associations
  "service-city-pages",
  "map-service-area",
]);

const NA_MESSAGE = "Not applicable: this check is for contractor and home-service websites.";

// On a non-contractor site, contractor-only checks become "na" (grey, not scored).
export function applySiteType(checks: CheckResult[], siteType: SiteType): CheckResult[] {
  if (siteType === "contractor") return checks;
  return checks.map((c) =>
    CONTRACTOR_ONLY.has(c.id) ? { ...c, status: "na", message: NA_MESSAGE, value: undefined } : c,
  );
}
