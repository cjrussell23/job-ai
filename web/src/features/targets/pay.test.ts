import { describe, expect, test } from "vitest";
import { comparePay, toAnnual, toHourly } from "./pay";

describe("toAnnual", () => {
  test("hourly pay uses the weekly hours, 40 by default", () => {
    expect(toAnnual(20, "hour")).toBe(41_600);
    expect(toAnnual(20, "hour", 25)).toBe(26_000);
  });

  test("other periods", () => {
    expect(toAnnual(200, "day")).toBe(52_000);
    expect(toAnnual(1_000, "week")).toBe(52_000);
    expect(toAnnual(5_000, "month")).toBe(60_000);
    expect(toAnnual(90_000, "year")).toBe(90_000);
  });
});

test("toHourly reverses toAnnual", () => {
  expect(toHourly(41_600)).toBe(20);
  expect(toHourly(26_000, 25)).toBe(20);
});

describe("comparePay", () => {
  const annualTarget = { minimum: 100_000, basis: "annual" as const, hoursPerWeek: null };

  test("missing pay is unknown, never a fail", () => {
    expect(comparePay({ min: null, max: null, period: null }, annualTarget)).toBe("unknown");
  });

  test("no minimum means any pay meets it", () => {
    expect(
      comparePay({ min: 10, max: 12, period: "hour" }, { ...annualTarget, minimum: null }),
    ).toBe("meets");
  });

  test("a range that reaches the minimum counts", () => {
    expect(comparePay({ min: 85_000, max: 105_000, period: "year" }, annualTarget)).toBe("meets");
    expect(comparePay({ min: 80_000, max: 95_000, period: "year" }, annualTarget)).toBe("below");
  });

  test("hourly jobs against an annual target use the desired hours", () => {
    // $50/h at 40 h/week is $104,000; at 30 h/week it is $78,000.
    expect(comparePay({ min: 50, max: 50, period: "hour" }, annualTarget)).toBe("meets");
    expect(
      comparePay({ min: 50, max: 50, period: "hour" }, { ...annualTarget, hoursPerWeek: 30 }),
    ).toBe("below");
  });

  test("annual jobs against an hourly target", () => {
    const hourlyTarget = { minimum: 19, basis: "hourly" as const, hoursPerWeek: 40 };
    expect(comparePay({ min: 40_000, max: null, period: "year" }, hourlyTarget)).toBe("meets");
    expect(comparePay({ min: 35_000, max: null, period: "year" }, hourlyTarget)).toBe("below");
  });
});
