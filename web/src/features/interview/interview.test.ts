import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { interviewQuestions, interviewSets } from "@/db/schema";
import { createItem, listItems } from "@/features/profile/profile";
import { resetDb } from "@/test/db";
import { fakeModel } from "@/test/fake-model";
import { createMember } from "@/test/fixtures";
import {
  decideProposal,
  proposalComesFromAnswer,
  questionsFor,
  runRating,
  runSet,
  saveAnswer,
  startRating,
  startSet,
} from "./interview";

let restore = () => {};
beforeEach(resetDb);
afterEach(() => restore());
afterAll(closeDb);

const answer =
  "At Acme I rebuilt the billing checks after invoices kept going out wrong. I traced the errors to three data sources, wrote validation for each, and invoice errors dropped by 40% within two months.";

describe("interview practice", () => {
  test("a proposal must come from the answer, numbers included", () => {
    expect(
      proposalComesFromAnswer(
        "Rebuilt billing checks, cutting invoice errors by 40% in two months.",
        answer,
      ),
    ).toBe(true);
    expect(
      proposalComesFromAnswer("Rebuilt billing checks, cutting invoice errors by 60%.", answer),
    ).toBe(false);
    expect(
      proposalComesFromAnswer("Led a team of twelve engineers across three countries.", answer),
    ).toBe(false);
  });

  test("questions are written for the member, answers are rated, and new facts become profile items only when accepted", async () => {
    const userId = await createMember("a@example.com");
    const role = await createItem(userId, {
      type: "role",
      title: "Developer",
      organization: "Acme",
    });
    if (!role.ok) throw new Error("role");
    // A job not on the member's board can't get a set.
    expect(await startSet(userId, "00000000-0000-4000-8000-000000000001")).toEqual({
      ok: false,
      reason: "not_tracked",
    });

    const [set] = await db().insert(interviewSets).values({ userId }).returning();
    if (!set) throw new Error("set");
    const fake = fakeModel((prompt: string) =>
      prompt.includes("likely to be asked")
        ? {
            questions: [
              {
                category: "behavioural",
                question: "Tell me about a time you fixed a recurring problem.",
                lookingFor: "Ownership and a result.",
              },
              {
                category: "project",
                question: "Walk me through the billing work at Acme.",
                lookingFor: "Depth.",
              },
              {
                category: "motivation",
                question: "Why are you looking now?",
                lookingFor: "A clear reason.",
              },
            ],
          }
        : {
            score: 82,
            summary: "Specific and results-focused.",
            strengths: ["Clear result"],
            improvements: ["Say what you learned"],
            newItem: {
              type: "bullet",
              parentId: role.id,
              title: "",
              content:
                "Rebuilt billing checks across three data sources, cutting invoice errors by 40% within two months.",
            },
          },
    );
    restore = fake.restore;
    await runSet(userId, set.id);
    const questions = await questionsFor(userId, set.id);
    expect(questions.map((q) => q.category)).toEqual(["behavioural", "project", "motivation"]);

    const other = await createMember("b@example.com");
    expect(await questionsFor(other, set.id)).toEqual([]);
    const first = questions[0];
    if (!first) throw new Error("question");
    expect(await saveAnswer(other, first.id, "Not mine")).toBe(false);

    expect(await saveAnswer(userId, first.id, "Short.")).toBe(true);
    expect(await startRating(userId, first.id)).toEqual({ ok: false, reason: "too_short" });
    await saveAnswer(userId, first.id, answer);
    // The worker would pick this up; mark it as queued and run it directly.
    await db()
      .update(interviewQuestions)
      .set({ ratingState: "rating" })
      .where(eq(interviewQuestions.id, first.id));
    await runRating(userId, first.id);
    const [rated] = await questionsFor(userId, set.id);
    expect(rated).toMatchObject({
      ratingState: "rated",
      score: 82,
      proposalState: "open",
      ratedAnswer: answer,
    });
    expect(rated?.proposal).toMatchObject({ type: "bullet", parentId: role.id });

    const before = (await listItems(userId)).length;
    expect(await decideProposal(other, first.id, true)).toEqual({ ok: false, reason: "not_found" });
    expect(await decideProposal(userId, first.id, true)).toEqual({ ok: true });
    const items = await listItems(userId);
    expect(items).toHaveLength(before + 1);
    expect(items.find((i) => i.source === "interview")).toMatchObject({
      type: "bullet",
      parentId: role.id,
    });
  });
});
