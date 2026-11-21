/** Every schedule in the app is in Calgary time. */
export const appTimeZone = "America/Edmonton";

function parts(now: Date) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: appTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return values as Record<"year" | "month" | "day" | "hour" | "minute", string>;
}

/** The Calgary calendar date, as YYYY-MM-DD. */
export function localDate(now: Date = new Date()): string {
  const p = parts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since midnight in Calgary. */
export function localMinutes(now: Date = new Date()): number {
  const p = parts(now);
  return Number(p.hour) * 60 + Number(p.minute);
}

/** "05:30" -> 330. */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/**
 * Whether the scheduled run is due: it is past the run time today and today's run has
 * not happened. A day missed while the server was off is caught up on the next check.
 */
export function scheduledRunDue(
  now: Date,
  runTime: string,
  lastScheduledDate: string | null,
): boolean {
  return localMinutes(now) >= timeToMinutes(runTime) && lastScheduledDate !== localDate(now);
}
