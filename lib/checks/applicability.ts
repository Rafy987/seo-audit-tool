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

// On a non-contractor site:
// - contractor-only checks become "na" (grey, not scored)
// - a missing LocalBusiness schema is only a Notice (useful for a physical shop, not critical)
export function applySiteType(checks: CheckResult[], siteType: SiteType): CheckResult[] {
  if (siteType === "contractor") return checks;
  return checks.map((c): CheckResult => {
    if (CONTRACTOR_ONLY.has(c.id)) return { ...c, status: "na", message: NA_MESSAGE, value: undefined };
    if (c.id === "local-schema" && c.status === "error") {
      return { ...c, status: "notice", message: "No LocalBusiness schema found. If you have a physical shop or showroom, adding it helps you show up in local Google results (name, address, phone, opening hours)." };
    }
    return c;
  });
}
