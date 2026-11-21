import { comparePay, type PayPeriod } from "@/features/targets/pay";
import { locationKnown, parsePlace, placeContains } from "@/lib/places";

/**
 * Firm limits run before any model call (CLAUDE.md rule 5). A field the postings do
 * not state is "unknown", never a fail, unless the member asked to hide unknowns for
 * that limit. A pay estimate is never used here (ADR 0002).
 */

export type JobFacts = {
  location: string;
  remote: "remote" | "hybrid" | "onsite" | "unknown";
  payMin: number | null;
  payMax: number | null;
  payPeriod: PayPeriod | null;
};

export type TargetLimits = {
  locations: string[];
  workplace: "remote_only" | "local_or_remote" | "local_only";
  locationIsFirm: boolean;
  hideUnknownLocation: boolean;
  minPayCents: number | null;
  payBasis: "hourly" | "annual";
  desiredHours: number | null;
  payIsFirm: boolean;
  hideUnknownPay: boolean;
};

export type LimitOutcome = "pass" | "fail" | "unknown";

export type FirmLimitResult = {
  pass: boolean;
  failed: ("location" | "pay")[];
  unknown: ("location" | "pay")[];
};

export function locationOutcome(job: JobFacts, target: TargetLimits): LimitOutcome {
  // A target's places are cities, provinces or countries ("Calgary, AB", "Alberta", "Canada").
  const known = locationKnown(job.location);
  const inTargetCity = target.locations.some((text) => {
    const place = parsePlace(text);
    return place !== null && placeContains(place, job.location);
  });
  switch (target.workplace) {
    case "remote_only":
      if (job.remote === "remote") return "pass";
      return job.remote === "unknown" ? "unknown" : "fail";
    case "local_only":
      if (inTargetCity) return "pass";
      return known ? "fail" : "unknown";
    case "local_or_remote":
      if (inTargetCity || job.remote === "remote") return "pass";
      return !known && job.remote === "unknown" ? "unknown" : "fail";
  }
}

export function payOutcome(job: JobFacts, target: TargetLimits): LimitOutcome {
  const result = comparePay(
    { min: job.payMin, max: job.payMax, period: job.payPeriod },
    {
      minimum: target.minPayCents === null ? null : target.minPayCents / 100,
      basis: target.payBasis,
      hoursPerWeek: target.desiredHours,
    },
  );
  return result === "meets" ? "pass" : result === "below" ? "fail" : "unknown";
}

export function checkFirmLimits(job: JobFacts, target: TargetLimits): FirmLimitResult {
  const result: FirmLimitResult = { pass: true, failed: [], unknown: [] };
  const apply = (
    field: "location" | "pay",
    firm: boolean,
    hideUnknown: boolean,
    outcome: LimitOutcome,
  ) => {
    if (!firm) return;
    if (outcome === "fail" || (outcome === "unknown" && hideUnknown)) result.failed.push(field);
    else if (outcome === "unknown") result.unknown.push(field);
  };
  apply(
    "location",
    target.locationIsFirm,
    target.hideUnknownLocation,
    locationOutcome(job, target),
  );
  apply("pay", target.payIsFirm, target.hideUnknownPay, payOutcome(job, target));
  result.pass = result.failed.length === 0;
  return result;
}

/** One number for sorting and the notification threshold. */
export function combinedScore(
  targetFit: number | null,
  profileFit: number | null,
  targetFitWeightPercent: number,
): number | null {
  if (targetFit === null || profileFit === null) return null;
  const weight = Math.min(100, Math.max(0, targetFitWeightPercent)) / 100;
  return Math.round(targetFit * weight + profileFit * (1 - weight));
}
