/** How often a stated pay amount is paid. Postings use all of these. */
export type PayPeriod = "hour" | "day" | "week" | "month" | "year";

export const defaultHoursPerWeek = 40;
const weeksPerYear = 52;
const workdaysPerWeek = 5;

/** Converts an amount on any period to a yearly figure, at the given weekly hours. */
export function toAnnual(
  amount: number,
  period: PayPeriod,
  hoursPerWeek: number = defaultHoursPerWeek,
): number {
  switch (period) {
    case "hour":
      return amount * hoursPerWeek * weeksPerYear;
    case "day":
      return amount * workdaysPerWeek * weeksPerYear;
    case "week":
      return amount * weeksPerYear;
    case "month":
      return amount * 12;
    case "year":
      return amount;
  }
}

/** Converts a yearly figure to an hourly rate, at the given weekly hours. */
export function toHourly(annual: number, hoursPerWeek: number = defaultHoursPerWeek): number {
  return annual / (hoursPerWeek * weeksPerYear);
}

export type PayComparison = "meets" | "below" | "unknown";

/**
 * Whether a job's stated pay reaches the target's minimum. Compares the top of the
 * job's range, so a range that overlaps the minimum counts. Missing pay is unknown,
 * never a fail.
 */
export function comparePay(
  job: { max: number | null; min: number | null; period: PayPeriod | null },
  target: { minimum: number | null; basis: "hourly" | "annual"; hoursPerWeek: number | null },
): PayComparison {
  if (target.minimum === null) return "meets";
  const top = job.max ?? job.min;
  if (top === null || job.period === null) return "unknown";
  const hours = target.hoursPerWeek ?? defaultHoursPerWeek;
  const jobAnnual = toAnnual(top, job.period, hours);
  const targetAnnual = toAnnual(target.minimum, target.basis === "hourly" ? "hour" : "year", hours);
  return jobAnnual >= targetAnnual ? "meets" : "below";
}
