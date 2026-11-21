import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobTargets } from "@/db/schema";
import type { JobTarget } from "./targets";

/** Every member's active targets with approved titles, for matching in the worker. */
export async function activeTargets(): Promise<JobTarget[]> {
  const rows = await db().select().from(jobTargets).where(eq(jobTargets.active, true));
  return rows.filter((t) => t.searchTitles.length > 0);
}

const dollars = (cents: number) =>
  (cents / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

/** A target as a model reads it, for scoring target fit. */
export function targetForPrompt(target: JobTarget, learnedPreferences: string[] = []): string {
  const place =
    target.workplace === "remote_only"
      ? "Remote only"
      : `${target.locations.join("; ") || "Anywhere"}${target.workplace === "local_or_remote" ? ", or remote" : " only"}`;
  const pay =
    target.minPayCents === null
      ? "no minimum given"
      : `at least ${dollars(target.minPayCents)} ${target.payBasis === "hourly" ? "an hour" : "a year"}`;
  const lines = [
    `Kind of job: ${target.roleType}`,
    `Titles they search for: ${target.searchTitles.join("; ")}`,
    `Where: ${place}`,
    `Pay: ${pay}`,
  ];
  if (target.desiredHours) lines.push(`Hours they want: ${target.desiredHours} a week`);
  if (target.note) lines.push(`Their note: ${target.note}`);
  if (learnedPreferences.length) {
    lines.push(`Learned from their feedback: ${learnedPreferences.join("; ")}`);
  }
  return lines.join("\n");
}
