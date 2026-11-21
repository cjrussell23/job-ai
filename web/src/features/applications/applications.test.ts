import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { feedback, jobs } from "@/db/schema";
import { approveDocument, finishDocument, startDocument } from "@/features/documents/documents";
import { ingestPostings } from "@/features/jobs/ingest";
import { parsePostings } from "@/features/sources/source";
import { resetDb } from "@/test/db";
import { createMember } from "@/test/fixtures";
import {
  attachApprovedIfEmpty,
  attachDocument,
  eventsFor,
  getApplication,
  jobIdsWithApplications,
  listApplications,
  removeApplication,
  setNotes,
  setStatus,
  trackJob,
} from "./applications";

beforeEach(resetDb);
afterAll(closeDb);

async function aJob(): Promise<string> {
  const { postings } = parsePostings([
    {
      url: "https://ca.indeed.com/viewjob?jk=9",
      title: "Data Analyst",
      company: "Gamma",
      location: "Calgary, AB",
      description: "SQL.",
    },
  ]);
  await ingestPostings("indeed", postings);
  const [job] = await db().select().from(jobs);
  if (!job) throw new Error("no job");
  return job.id;
}

async function draftResume(userId: string, jobId: string): Promise<string> {
  const id = await startDocument(userId, jobId, "resume");
  await finishDocument(userId, id, {
    kind: "resume",
    name: "Jane",
    contact: "",
    links: [],
    summary: [],
    sections: [],
    skills: [],
  });
  return id;
}

describe("applications", () => {
  test("saving starts tracking, records feedback, and moves through statuses with dates", async () => {
    const userId = await createMember("a@example.com");
    const jobId = await aJob();
    const application = await trackJob(userId, jobId, "saved", null);
    expect(application.status).toBe("saved");
    expect(application.submissionMethod).toBe("manual");
    expect(application.approvalState).toBe("not_required");
    expect(await jobIdsWithApplications(userId)).toEqual(new Set([jobId]));

    // Saving twice keeps one application.
    await trackJob(userId, jobId, "saved", null);
    expect(await listApplications(userId)).toHaveLength(1);

    await setStatus(userId, application.id, "applied");
    await setStatus(userId, application.id, "interviewing");
    const history = (await eventsFor(userId, [application.id])).get(application.id) ?? [];
    expect(history.map((e) => e.status)).toEqual(["saved", "applied", "interviewing"]);
    const kinds = (await db().select().from(feedback)).map((f) => f.kind).sort();
    expect(kinds).toEqual(["applied", "saved"]);

    expect(await removeApplication(userId, application.id)).toEqual({ ok: true });
    expect(await jobIdsWithApplications(userId)).toEqual(new Set());
  });

  test("only approved documents for the same job can be attached", async () => {
    const userId = await createMember("a@example.com");
    const jobId = await aJob();
    const application = await trackJob(userId, jobId, "applied", null);
    const resumeId = await draftResume(userId, jobId);

    expect(await attachDocument(userId, application.id, resumeId, "resume")).toEqual({
      ok: false,
      reason: "not_approved",
    });
    expect(await attachDocument(userId, application.id, resumeId, "cover_letter")).toEqual({
      ok: false,
      reason: "wrong_kind",
    });
    await approveDocument(userId, resumeId);
    expect(await attachDocument(userId, application.id, resumeId, "resume")).toEqual({ ok: true });
    expect((await getApplication(userId, application.id))?.resumeId).toBe(resumeId);
    expect(await attachDocument(userId, application.id, null, "resume")).toEqual({ ok: true });
  });

  test("one member cannot read or change another's applications", async () => {
    const userId = await createMember("a@example.com");
    const other = await createMember("b@example.com");
    const jobId = await aJob();
    const application = await trackJob(userId, jobId, "saved", null);
    const resumeId = await draftResume(userId, jobId);
    await approveDocument(userId, resumeId);

    expect(await listApplications(other)).toEqual([]);
    expect(await getApplication(other, application.id)).toBeUndefined();
    expect((await eventsFor(other, [application.id])).size).toBe(0);
    expect(await setStatus(other, application.id, "offer")).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await setNotes(other, application.id, "x")).toEqual({ ok: false, reason: "not_found" });
    expect(await removeApplication(other, application.id)).toEqual({
      ok: false,
      reason: "not_found",
    });
    // Nor attach someone else's document to their own application of the same job.
    const theirs = await trackJob(other, jobId, "saved", null);
    expect(await attachDocument(other, theirs.id, resumeId, "resume")).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect((await getApplication(userId, application.id))?.status).toBe("saved");
  });

  test("an approved tailored resume is attached when tracking starts, and later approvals fill an empty slot only", async () => {
    const userId = await createMember("a@example.com");
    const jobId = await aJob();
    const first = await draftResume(userId, jobId);
    await approveDocument(userId, first);
    const application = await trackJob(userId, jobId, "saved", null);
    expect(application.resumeId).toBe(first);

    // A member's own choice is never replaced.
    await attachDocument(userId, application.id, null, "resume");
    await attachApprovedIfEmpty(userId, jobId);
    expect((await getApplication(userId, application.id))?.resumeId).toBe(first);
    await attachDocument(userId, application.id, null, "resume");
    expect((await getApplication(userId, application.id))?.resumeId).toBeNull();

    // Nothing for another member's job.
    const other = await createMember("b@example.com");
    await attachApprovedIfEmpty(other, jobId);
    expect(await jobIdsWithApplications(other)).toEqual(new Set());
  });
});
