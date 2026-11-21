import { describe, expect, test } from "vitest";
import { checkFirmLimits, combinedScore, type JobFacts, type TargetLimits } from "./firm-limits";

const job = (overrides: Partial<JobFacts> = {}): JobFacts => ({
  location: "Calgary, AB",
  remote: "onsite",
  payMin: null,
  payMax: null,
  payPeriod: null,
  ...overrides,
});

const target = (overrides: Partial<TargetLimits> = {}): TargetLimits => ({
  locations: ["Calgary, AB"],
  workplace: "local_or_remote",
  locationIsFirm: false,
  hideUnknownLocation: false,
  minPayCents: null,
  payBasis: "annual",
  desiredHours: null,
  payIsFirm: false,
  hideUnknownPay: false,
  ...overrides,
});

describe("firm limits", () => {
  test("preferences never hide a job", () => {
    expect(
      checkFirmLimits(job({ location: "Toronto, ON" }), target({ minPayCents: 10_000_000 })),
    ).toEqual({
      pass: true,
      failed: [],
      unknown: [],
    });
  });

  test("a firm location limit hides jobs elsewhere, but remote jobs pass when remote is welcome", () => {
    const firm = target({ locationIsFirm: true });
    expect(checkFirmLimits(job({ location: "Toronto, ON" }), firm).failed).toEqual(["location"]);
    expect(checkFirmLimits(job({ location: "Toronto, ON", remote: "remote" }), firm).pass).toBe(
      true,
    );
    expect(
      checkFirmLimits(
        job({ location: "Toronto, ON", remote: "remote" }),
        target({ locationIsFirm: true, workplace: "local_only" }),
      ).pass,
    ).toBe(false);
  });

  test("remote only wants remote jobs; an unstated workplace is unknown", () => {
    const remoteOnly = target({ locationIsFirm: true, workplace: "remote_only" });
    expect(checkFirmLimits(job({ remote: "remote" }), remoteOnly).pass).toBe(true);
    expect(checkFirmLimits(job({ remote: "hybrid" }), remoteOnly).failed).toEqual(["location"]);
    expect(checkFirmLimits(job({ remote: "unknown" }), remoteOnly)).toEqual({
      pass: true,
      failed: [],
      unknown: ["location"],
    });
  });

  test("missing pay is unknown, never a fail, unless the member hides unknowns", () => {
    const firmPay = target({ payIsFirm: true, minPayCents: 9_000_000 });
    expect(checkFirmLimits(job(), firmPay)).toEqual({ pass: true, failed: [], unknown: ["pay"] });
    expect(checkFirmLimits(job(), { ...firmPay, hideUnknownPay: true }).failed).toEqual(["pay"]);
  });

  test("stated pay is compared across hourly and annual at the member's hours", () => {
    const hourlyTarget = target({
      payIsFirm: true,
      minPayCents: 1900,
      payBasis: "hourly",
      desiredHours: 25,
    });
    expect(
      checkFirmLimits(job({ payMin: 18.5, payMax: 18.5, payPeriod: "hour" }), hourlyTarget).failed,
    ).toEqual(["pay"]);
    expect(
      checkFirmLimits(job({ payMin: 20, payMax: 22, payPeriod: "hour" }), hourlyTarget).pass,
    ).toBe(true);
    expect(
      checkFirmLimits(job({ payMin: 30_000, payMax: 30_000, payPeriod: "year" }), hourlyTarget)
        .pass,
    ).toBe(true);
  });
});

test("the combined score weights target fit by the member's setting", () => {
  expect(combinedScore(90, 40, 60)).toBe(70);
  expect(combinedScore(60, 90, 60)).toBe(72);
  expect(combinedScore(80, 50, 100)).toBe(80);
  expect(combinedScore(80, null, 60)).toBeNull();
});
