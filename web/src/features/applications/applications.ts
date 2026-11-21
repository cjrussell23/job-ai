import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  type Application,
  type ApplicationEvent,
  applicationEvents,
  applications,
} from "@/db/schema";
import { getDocument } from "@/features/documents/documents";
import { recordFeedback } from "@/features/feedback/feedback";

export type { Application, ApplicationEvent };
export const statuses = [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
] as const;
export type Status = (typeof statuses)[number];

export const statusLabels: Record<Status, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export async function listApplications(userId: string): Promise<Application[]> {
  return db()
    .select()
    .from(applications)
    .where(eq(applications.userId, userId))
    .orderBy(desc(applications.updatedAt));
}

export async function getApplication(userId: string, id: string): Promise<Application | undefined> {
  const [row] = await db()
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)));
  return row;
}

export async function applicationForJob(
  userId: string,
  jobId: string,
): Promise<Application | undefined> {
  const [row] = await db()
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.jobId, jobId)));
  return row;
}

/** Job ids the member has an application for: those are no longer live matches. */
export async function jobIdsWithApplications(userId: string): Promise<Set<string>> {
  const rows = await db()
    .select({ jobId: applications.jobId })
    .from(applications)
    .where(eq(applications.userId, userId));
  return new Set(rows.map((r) => r.jobId));
}

export async function eventsFor(
  userId: string,
  applicationIds: string[],
): Promise<Map<string, ApplicationEvent[]>> {
  if (applicationIds.length === 0) return new Map();
  const rows = await db()
    .select({ event: applicationEvents })
    .from(applicationEvents)
    .innerJoin(applications, eq(applications.id, applicationEvents.applicationId))
    .where(
      and(
        eq(applications.userId, userId),
        inArray(applicationEvents.applicationId, applicationIds),
      ),
    )
    .orderBy(asc(applicationEvents.at));
  const byApplication = new Map<string, ApplicationEvent[]>();
  for (const { event } of rows) {
    byApplication.set(event.applicationId, [
      ...(byApplication.get(event.applicationId) ?? []),
      event,
    ]);
  }
  return byApplication;
}

/**
 * Starts tracking a job (rule 11: an application exists only once the member acts).
 * Saving or applying is also a feedback signal.
 */
export async function trackJob(
  userId: string,
  jobId: string,
  status: "saved" | "applied",
  targetId: string | null,
): Promise<Application> {
  const existing = await applicationForJob(userId, jobId);
  if (existing) {
    if (existing.status === "saved" && status === "applied")
      await setStatus(userId, existing.id, "applied");
    return (await getApplication(userId, existing.id)) ?? existing;
  }
  const [created] = await db().insert(applications).values({ userId, jobId, status }).returning();
  if (!created) throw new Error("application insert returned no row");
  await db().insert(applicationEvents).values({ applicationId: created.id, status });
  await recordFeedback(userId, { jobId, targetId, kind: status });
  return created;
}

export type ChangeResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_approved" | "wrong_kind" };

export async function setStatus(userId: string, id: string, status: Status): Promise<ChangeResult> {
  const current = await getApplication(userId, id);
  if (!current) return { ok: false, reason: "not_found" };
  if (current.status === status) return { ok: true };
  await db()
    .update(applications)
    .set({ status, updatedAt: sql`now()` })
    .where(and(eq(applications.id, id), eq(applications.userId, userId)));
  await db().insert(applicationEvents).values({ applicationId: id, status });
  if (status === "applied")
    await recordFeedback(userId, { jobId: current.jobId, targetId: null, kind: "applied" });
  return { ok: true };
}

/** Attaches a document to an application: the member's own approved document for this job, or a standing resume (rule 6). */
export async function attachDocument(
  userId: string,
  id: string,
  documentId: string | null,
  kind: "resume" | "cover_letter",
): Promise<ChangeResult> {
  const application = await getApplication(userId, id);
  if (!application) return { ok: false, reason: "not_found" };
  if (documentId) {
    const doc = await getDocument(userId, documentId);
    if (!doc) return { ok: false, reason: "not_found" };
    // A standing resume suits any job; a tailored document only its own.
    if (doc.kind !== kind || (!doc.standing && doc.jobId !== application.jobId))
      return { ok: false, reason: "wrong_kind" };
    if (doc.state !== "approved") return { ok: false, reason: "not_approved" };
  }
  await db()
    .update(applications)
    .set(
      kind === "resume"
        ? { resumeId: documentId, updatedAt: sql`now()` }
        : { coverLetterId: documentId, updatedAt: sql`now()` },
    )
    .where(and(eq(applications.id, id), eq(applications.userId, userId)));
  return { ok: true };
}

export async function setNotes(userId: string, id: string, notes: string): Promise<ChangeResult> {
  const updated = await db()
    .update(applications)
    .set({ notes: notes.slice(0, 5000), updatedAt: sql`now()` })
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .returning({ id: applications.id });
  return updated.length > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}

/** Stops tracking: the job returns to being a match in the feed. */
export async function removeApplication(userId: string, id: string): Promise<ChangeResult> {
  const deleted = await db()
    .delete(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .returning({ id: applications.id });
  return deleted.length > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}
