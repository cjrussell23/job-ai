import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { applySessions, jobs } from "@/db/schema";
import { getApplication } from "@/features/applications/applications";
import { ingestPostings } from "@/features/jobs/ingest";
import { saveContact } from "@/features/profile/contact";
import { createItem } from "@/features/profile/profile";
import { parsePostings } from "@/features/sources/source";
import { resetDb } from "@/test/db";
import { fakeModel } from "@/test/fake-model";
import { createMember } from "@/test/fixtures";
import {
  deleteSavedAnswer,
  getStandardAnswers,
  listSavedAnswers,
  questionKey,
  saveAnswers,
  saveStandardAnswers,
  updateSavedAnswer,
} from "./answers";
import { applyUrlFor, sortLinks, splitLocation, splitName } from "./packet";
import {
  cleanAnswers,
  finishSession,
  packetFor,
  runAnswers,
  sessionForTicket,
  startApplySession,
} from "./sessions";

describe("packet helpers", () => {
  test("names and places split the way forms ask for them", () => {
    expect(splitName("Mary Ann Smith")).toEqual({ firstName: "Mary", lastName: "Ann Smith" });
    expect(splitName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
    expect(splitLocation("Calgary, AB")).toEqual({
      city: "Calgary",
      province: "Alberta",
      provinceCode: "AB",
      country: "Canada",
    });
    expect(splitLocation("")).toEqual({ city: "", province: "", provinceCode: "", country: "" });
  });

  test("links are sorted by site", () => {
    const sorted = sortLinks([
      { label: "", url: "https://github.com/me" },
      { label: "", url: "https://www.linkedin.com/in/me" },
      { label: "", url: "https://me.dev" },
      { label: "", url: "https://x.com/me" },
    ]);
    expect(sorted.linkedin).toBe("https://www.linkedin.com/in/me");
    expect(sorted.github).toBe("https://github.com/me");
    expect(sorted.website).toBe("https://me.dev");
    expect(sorted.otherLinks).toHaveLength(1);
  });

  test("the employer's own form is preferred, and Lever and Ashby open their form page", () => {
    expect(
      applyUrlFor(["https://ca.indeed.com/viewjob?jk=1", "https://jobs.lever.co/acme/abc-123"]),
    ).toBe("https://jobs.lever.co/acme/abc-123/apply");
    expect(applyUrlFor(["https://jobs.ashbyhq.com/acme/xyz"])).toBe(
      "https://jobs.ashbyhq.com/acme/xyz/application",
    );
    expect(applyUrlFor(["https://ca.indeed.com/viewjob?jk=1"])).toBe(
      "https://ca.indeed.com/viewjob?jk=1",
    );
    expect(applyUrlFor([])).toBeNull();
  });

  test("questions match across small wording differences", () => {
    expect(questionKey("Years of experience with React? *")).toBe(
      questionKey("years of experience with react (required)"),
    );
  });

  test("model answers are kept only for asked questions and real options and items", () => {
    const cleaned = cleanAnswers(
      [
        { key: "a", label: "Pick one", kind: "select", options: ["Yes", "No"], required: true },
        { key: "b", label: "Why us?", kind: "textarea", options: [], required: false },
      ],
      [
        { key: "a", answer: "Maybe", sourceIds: [] },
        { key: "b", answer: "Because.", sourceIds: ["real", "invented"] },
        { key: "zzz", answer: "Not asked", sourceIds: [] },
      ],
      new Set(["real"]),
    );
    expect(cleaned).toEqual([
      { key: "a", answer: null, sourceIds: [] },
      { key: "b", answer: "Because.", sourceIds: ["real"] },
    ]);
  });
});

beforeEach(resetDb);
afterAll(closeDb);

async function aJob(): Promise<string> {
  const { postings } = parsePostings([
    {
      url: "https://jobs.lever.co/acme/abc-123",
      title: "Developer",
      company: "Acme",
      location: "Calgary, AB",
      description: "TypeScript.",
    },
  ]);
  await ingestPostings("lever", postings);
  const [job] = await db().select().from(jobs);
  if (!job) throw new Error("no job");
  return job.id;
}

describe("apply sessions", () => {
  test("starting autofill tracks the job as assisted and opens only that member's packet", async () => {
    const a = await createMember("a@example.com");
    const b = await createMember("b@example.com");
    const jobId = await aJob();
    await saveContact(a, {
      fullName: "Ann Example",
      email: "ann@example.com",
      phone: "403-555-0100",
      location: "Calgary, AB",
      links: [{ label: "", url: "linkedin.com/in/ann" }],
    });
    await saveStandardAnswers(a, { workAuthorized: true, noticePeriod: "Two weeks" });
    const started = await startApplySession(a, jobId, null);
    if (!started.ok) throw new Error("not started");
    expect(started.applyUrl).toBe("https://jobs.lever.co/acme/abc-123/apply");

    const session = await sessionForTicket(started.ticket);
    expect(session?.userId).toBe(a);
    const application = await getApplication(a, session?.applicationId ?? "");
    expect(application?.submissionMethod).toBe("assisted");
    expect(application?.approvalState).toBe("approved");
    expect(await getApplication(b, session?.applicationId ?? "")).toBeUndefined();

    const packet = session ? await packetFor(session) : null;
    expect(packet?.contact).toMatchObject({
      firstName: "Ann",
      lastName: "Example",
      email: "ann@example.com",
      city: "Calgary",
      linkedin: "https://linkedin.com/in/ann",
    });
    expect(packet?.standard.workAuthorized).toBe(true);
    expect(packet?.documents.resume).toBeNull();

    // The ticket is stored only as a hash, and a wrong or expired ticket opens nothing.
    const [row] = await db().select().from(applySessions);
    expect(row?.ticketHash).not.toContain(started.ticket);
    expect(await sessionForTicket("x".repeat(43))).toBeUndefined();
    expect(await sessionForTicket("not a ticket")).toBeUndefined();
    await db()
      .update(applySessions)
      .set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await sessionForTicket(started.ticket)).toBeUndefined();
  });

  test("the model answers from the profile, and finishing marks applied and saves answers", async () => {
    const a = await createMember("a@example.com");
    const jobId = await aJob();
    const role = await createItem(a, {
      type: "role",
      title: "Developer",
      organization: "Initech",
      startDate: "2020",
      endDate: "Present",
    });
    if (!role.ok) throw new Error("no role");
    const started = await startApplySession(a, jobId, null);
    if (!started.ok) throw new Error("not started");
    const session = await sessionForTicket(started.ticket);
    if (!session) throw new Error("no session");
    await db()
      .update(applySessions)
      .set({
        answersState: "working",
        questions: [
          {
            key: "q1",
            label: "Years with TypeScript?",
            kind: "select",
            options: ["1-3", "4+"],
            required: true,
          },
          {
            key: "q2",
            label: "Security clearance number?",
            kind: "text",
            options: [],
            required: false,
          },
        ],
      })
      .where(eq(applySessions.id, session.id));
    const fake = fakeModel({
      answers: [
        { key: "q1", answer: "4+", sourceIds: [role.id, "made-up"] },
        { key: "q2", answer: null, sourceIds: [] },
      ],
    });
    try {
      await runAnswers(a, session.id);
    } finally {
      fake.restore();
    }
    const [answered] = await db().select().from(applySessions);
    expect(answered?.answersState).toBe("ready");
    expect(answered?.answers).toEqual([
      { key: "q1", answer: "4+", sourceIds: [role.id] },
      { key: "q2", answer: null, sourceIds: [] },
    ]);

    const result = await finishSession(session, {
      submitted: true,
      filledCount: 7,
      save: [{ question: "Years with TypeScript?", answer: "4+" }],
    });
    expect(result.saved).toBe(1);
    expect((await getApplication(a, session.applicationId))?.status).toBe("applied");
    expect((await listSavedAnswers(a)).map((s) => s.answer)).toEqual(["4+"]);
  });

  test("standard and saved answers belong to one member", async () => {
    const a = await createMember("a@example.com");
    const b = await createMember("b@example.com");
    await saveStandardAnswers(a, { salaryExpectation: "$120,000" });
    await saveAnswers(a, [{ question: "Why us?", answer: "Because." }]);
    expect((await getStandardAnswers(b)).salaryExpectation).toBe("");
    expect(await listSavedAnswers(b)).toEqual([]);
    const [saved] = await listSavedAnswers(a);
    if (!saved) throw new Error("not saved");
    expect((await updateSavedAnswer(b, saved.id, "Mine now")).ok).toBe(false);
    await deleteSavedAnswer(b, saved.id);
    expect(await listSavedAnswers(a)).toHaveLength(1);
  });
});
