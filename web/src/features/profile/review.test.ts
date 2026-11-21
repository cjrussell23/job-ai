import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { jobs, profileQuestions } from "@/db/schema";
import { startDocument } from "@/features/documents/documents";
import { generateDocument } from "@/features/documents/generate";
import { ingestPostings } from "@/features/jobs/ingest";
import { parsePostings } from "@/features/sources/source";
import { resetDb } from "@/test/db";
import { fakeModel } from "@/test/fake-model";
import { createMember } from "@/test/fixtures";
import { createItem, listItems, updateItem } from "./profile";
import {
  answerNo,
  answerYes,
  askedTopics,
  nextQuestion,
  recordedNos,
  skillGaps,
  skipQuestion,
} from "./questions";
import { latestReview, runReview, saveReview, startReview } from "./review";
import { acceptSuggestion, openSuggestions, rejectSuggestion } from "./suggestions";

let restore = () => {};
beforeEach(resetDb);
afterEach(() => restore());
afterAll(closeDb);

async function memberWithProfile(email = "a@example.com") {
  const userId = await createMember(email);
  const role = await createItem(userId, { type: "role", title: "Analyst", organization: "Acme" });
  if (!role.ok) throw new Error("no role");
  const bullet = await createItem(userId, {
    type: "bullet",
    parentId: role.id,
    content: "Was responsible for doing various reports for the team",
  });
  if (!bullet.ok) throw new Error("no bullet");
  return { userId, roleId: role.id, bulletId: bullet.id };
}

async function aJob(): Promise<string> {
  const { postings } = parsePostings([
    {
      url: "https://ca.indeed.com/viewjob?jk=7",
      title: "Data Analyst",
      company: "Gamma",
      location: "Calgary, AB",
      description: "Power BI required.",
    },
  ]);
  await ingestPostings("indeed", postings);
  const [job] = await db().select().from(jobs);
  if (!job) throw new Error("no job");
  return job.id;
}

describe("profile reviews", () => {
  test("a review keeps only suggestions and questions that point at real items and jobs", async () => {
    const { userId, roleId, bulletId } = await memberWithProfile();
    const items = await listItems(userId);
    const saved = await saveReview(
      userId,
      null,
      {
        suggestions: [
          {
            itemId: bulletId,
            kind: "vague",
            proposed: "Built weekly team reports",
            reason: "Vague.",
          },
          { itemId: "not-an-item", kind: "vague", proposed: "x", reason: "x" },
          // Job wording needs a job.
          { itemId: bulletId, kind: "job_wording", proposed: "y", reason: "y" },
        ],
        questions: [
          {
            topic: "Power BI",
            question: "Have you used Power BI?",
            trigger: "recurring_requirement",
            itemId: null,
            jobIds: ["j1", "j2", "made-up"],
          },
          // Mentioned in only one real match: not recurring.
          {
            topic: "Tableau",
            question: "Have you used Tableau?",
            trigger: "recurring_requirement",
            itemId: null,
            jobIds: ["j1"],
          },
          {
            topic: "Report results",
            question: "Did your reports lead to a measurable change?",
            trigger: "thin_item",
            itemId: roleId,
            jobIds: [],
          },
          {
            topic: "power bi",
            question: "Duplicate topic?",
            trigger: "forgotten_category",
            itemId: null,
            jobIds: [],
          },
        ],
      },
      items,
      new Set(["j1", "j2"]),
    );
    expect(saved).toEqual({ suggestions: 1, questions: 2 });
    const questions = await db().select().from(profileQuestions);
    expect(questions.find((q) => q.topic === "Power BI")?.jobCount).toBe(2);
  });

  test("runReview stores the model's output and a member cannot run two at once", async () => {
    const { userId, bulletId } = await memberWithProfile();
    const fake = fakeModel({
      suggestions: [
        {
          itemId: bulletId,
          kind: "vague",
          proposed: "Built weekly team reports",
          reason: "Vague.",
        },
      ],
      questions: [
        {
          topic: "Volunteering",
          question: "Have you done any volunteer work?",
          trigger: "forgotten_category",
          itemId: null,
          jobIds: [],
        },
      ],
    });
    restore = fake.restore;
    const started = await startReview(userId, null);
    if (!started.ok) throw new Error("not started");
    expect(await startReview(userId, null)).toEqual({ ok: false, reason: "busy" });
    await runReview(userId, started.reviewId);
    expect((await latestReview(userId, null))?.state).toBe("done");
    expect(await openSuggestions(userId)).toHaveLength(1);
    expect((await nextQuestion(userId))?.topic).toBe("Volunteering");
  });
});

describe("suggestions", () => {
  async function withSuggestion() {
    const member = await memberWithProfile();
    await saveReview(
      member.userId,
      null,
      {
        suggestions: [
          {
            itemId: member.bulletId,
            kind: "vague",
            proposed: "Built weekly team reports",
            reason: "Vague.",
          },
        ],
        questions: [],
      },
      await listItems(member.userId),
      new Set(),
    );
    const [suggestion] = await openSuggestions(member.userId);
    if (!suggestion) throw new Error("no suggestion");
    // A bullet is named by the role it sits under.
    expect(suggestion.itemContext).toBe("Analyst · Acme");
    return { ...member, suggestionId: suggestion.id };
  }

  test("accepting applies the wording; rejecting leaves the item alone", async () => {
    const { userId, bulletId, suggestionId } = await withSuggestion();
    expect(await acceptSuggestion(userId, suggestionId)).toEqual({ ok: true });
    const item = (await listItems(userId)).find((i) => i.id === bulletId);
    expect(item?.content).toBe("Built weekly team reports");
    expect(await rejectSuggestion(userId, suggestionId)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  test("an item edited since the suggestion is never overwritten", async () => {
    const { userId, bulletId, suggestionId } = await withSuggestion();
    await updateItem(userId, bulletId, { content: "My own new wording" });
    expect(await openSuggestions(userId)).toHaveLength(0);
    expect(await acceptSuggestion(userId, suggestionId)).toEqual({
      ok: false,
      reason: "item_changed",
    });
  });

  test("one member cannot see or decide another's suggestions", async () => {
    const { suggestionId } = await withSuggestion();
    const other = await createMember("b@example.com");
    expect(await openSuggestions(other)).toEqual([]);
    expect(await acceptSuggestion(other, suggestionId)).toEqual({ ok: false, reason: "not_found" });
    expect(await rejectSuggestion(other, suggestionId)).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("profile questions", () => {
  async function ask(
    userId: string,
    topic: string,
    trigger: "thin_item" | "recurring_requirement",
    itemId: string | null,
  ) {
    await saveReview(
      userId,
      null,
      {
        suggestions: [],
        questions: [
          {
            topic,
            question: `Have you used ${topic}?`,
            trigger,
            itemId,
            jobIds: trigger === "recurring_requirement" ? ["j1", "j2", "j3"] : [],
          },
        ],
      },
      await listItems(userId),
      new Set(["j1", "j2", "j3"]),
    );
    const question = await nextQuestion(userId);
    if (!question) throw new Error("no question");
    return question.id;
  }

  test("a yes needs an example, which becomes a profile item from a question", async () => {
    const { userId, roleId } = await memberWithProfile();
    const id = await ask(userId, "Report results", "thin_item", roleId);
    expect(await answerYes(userId, id, "yes")).toEqual({ ok: false, reason: "example_needed" });
    expect(await answerYes(userId, id, "Cut month-end reporting from three days to one.")).toEqual({
      ok: true,
    });
    const added = (await listItems(userId)).find((i) => i.source === "question");
    expect(added).toMatchObject({ type: "bullet", parentId: roleId });
    expect(await nextQuestion(userId)).toBeUndefined();
  });

  test("a no is kept, never re-asked, flagged as a skill gap, and reaches drafting", async () => {
    const { userId } = await memberWithProfile();
    const id = await ask(userId, "Power BI", "recurring_requirement", null);
    expect(await answerNo(userId, id)).toEqual({ ok: true });
    expect((await skillGaps(userId)).map((g) => [g.topic, g.jobCount])).toEqual([["Power BI", 3]]);
    expect(await recordedNos(userId)).toHaveLength(1);

    // Asking again about the same topic is dropped.
    await saveReview(
      userId,
      null,
      {
        suggestions: [],
        questions: [
          {
            topic: "Power BI",
            question: "Power BI?",
            trigger: "forgotten_category",
            itemId: null,
            jobIds: [],
          },
        ],
      },
      await listItems(userId),
      new Set(),
    );
    expect(await nextQuestion(userId)).toBeUndefined();
    expect(await askedTopics(userId)).toEqual(["Power BI"]);

    // The no is passed to the cover letter model as something not to claim.
    const jobId = await aJob();
    const fake = fakeModel({
      greeting: "Dear Hiring Team,",
      paragraphs: [
        { text: "Hello.", sources: [] },
        { text: "Thanks.", sources: [] },
      ],
      closing: "Sincerely,",
    });
    restore = fake.restore;
    const documentId = await startDocument(userId, jobId, "cover_letter");
    await generateDocument(userId, documentId, jobId, "cover_letter");
    expect(JSON.stringify(fake.calls[0]?.prompt)).toContain("never claim these");
    expect(JSON.stringify(fake.calls[0]?.prompt)).toContain("Power BI");
  });

  test("one member cannot answer another's questions", async () => {
    const { userId, roleId } = await memberWithProfile();
    const id = await ask(userId, "Volunteering", "thin_item", roleId);
    const other = await createMember("b@example.com");
    expect(await nextQuestion(other)).toBeUndefined();
    expect(await answerNo(other, id)).toEqual({ ok: false, reason: "not_found" });
    expect(await skipQuestion(other, id)).toEqual({ ok: false, reason: "not_found" });
    expect(await answerYes(other, id, "A long enough example here.")).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await recordedNos(other)).toEqual([]);
  });
});
