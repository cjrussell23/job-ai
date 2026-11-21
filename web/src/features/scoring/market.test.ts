import { describe, expect, test } from "vitest";
import type { JobFacts, TargetLimits } from "./firm-limits";
import { wideningCounts } from "./market";

const job = (overrides: Partial<JobFacts> = {}): JobFacts => ({
  location: "Calgary, AB",
  remote: "onsite",
  payMin: 80_000,
  payMax: 90_000,
  payPeriod: "year",
  ...overrides,
});

const target = (overrides: Partial<TargetLimits> = {}): TargetLimits => ({
  locations: ["Calgary, AB"],
  workplace: "local_only",
  locationIsFirm: true,
  hideUnknownLocation: false,
  minPayCents: 8_500_000,
  payBasis: "annual",
  desiredHours: null,
  payIsFirm: true,
  hideUnknownPay: true,
  ...overrides,
});

describe("widening counts", () => {
  const jobs = [
    job(), // max 90k meets 85k: passes
    job({ payMin: 70_000, payMax: 80_000 }), // under 85k, within 10% of it
    job({ payMin: 50_000, payMax: 60_000 }), // well under
    job({ payMin: null, payMax: null, payPeriod: null }), // pay not stated
    job({ location: "Toronto, ON" }), // elsewhere
  ];

  test("counts what each loosening of a firm limit would add, most first", () => {
    expect(wideningCounts(jobs, target())).toEqual({
      passing: 1,
      options: [
        { kind: "pay_preference", added: 3 },
        // Ties keep pay options before location ones.
        { kind: "show_unknown_pay", added: 1 },
        { kind: "lower_pay", added: 1 },
        { kind: "location_preference", added: 1 },
      ],
    });
  });

  test("limits that are already preferences offer nothing to loosen", () => {
    const view = wideningCounts(jobs, target({ payIsFirm: false, locationIsFirm: false }));
    expect(view).toEqual({ passing: 5, options: [] });
  });
});
