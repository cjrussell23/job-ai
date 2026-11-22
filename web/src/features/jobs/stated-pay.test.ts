import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { jobMatches, jobs } from "@/db/schema";
import { createMatches, estimateMissingPay } from "@/features/scoring/score";
import { parsePostings } from "@/features/sources/source";
import { approveSearchTitles, createTarget } from "@/features/targets/targets";
import { resetDb } from "@/test/db";
import { fakeModel } from "@/test/fake-model";
import { createMember } from "@/test/fixtures";
import { ingestPostings } from "./ingest";
import { payText, statedPayChecks } from "./jobs";

let restore = () => {};
beforeEach(resetDb);
afterEach(() => restore());
afterAll(closeDb);

const description =
  "Build payments software.\\n\\n**CAN base pay range per year:**\\nCAD $133,000 - $183,000.\\n\\nRemote in Canada.";

describe("pay stated in a description", () => {
  test("a quote counts only if it is in the description and holds both figures", () => {
    const real = { min: 133000, max: 183000, quote: "CAD $133,000 - $183,000" };
    expect(statedPayChecks(description, real)).toBe(true);
    expect(statedPayChecks(description, { ...real, max: 190000 })).toBe(false);
    expect(statedPayChecks(description, { ...real, quote: "CAD $133,000 - $190,000" })).toBe(false);
    expect(
      statedPayChecks("Base Salary Band: $140K - $192.5K", {
        min: 140000,
        max: 192500,
        quote: "$140K - $192.5K",
      }),
    ).toBe(true);
  });

  test("checked pay is saved as stated pay and re-checks firm limits; anything else stays an estimate", async () => {
    const userId = await createMember("a@example.com");
    const target = await createTarget(userId, {
      roleType: "Engineer",
      locations: ["Calgary, AB"],
      payIsFirm: true,
      minPayCents: 15_000_000,
      payBasis: "annual",
    });
    if (!target.ok) throw new Error("target");
    await approveSearchTitles(userId, target.id, ["Engineer"]);
    const { postings } = parsePostings([
      {
        url: "https://ca.indeed.com/viewjob?jk=1",
        title: "Engineer",
        company: "Affirm",
        location: "Calgary, AB",
        description,
      },
      {
        url: "https://ca.indeed.com/viewjob?jk=2",
        title: "Engineer",
        company: "Other",
        location: "Calgary, AB",
        description: "No pay given.",
      },
    ]);
    await ingestPostings("indeed", postings, new Date(), "Engineer");
    await createMatches();

    const fake = fakeModel((prompt: string) =>
      prompt.includes("Affirm")
        ? {
            stated: { min: 133000, max: 183000, period: "year", quote: "CAD $133,000 - $183,000" },
            estimate: {
              min: 120000,
              max: 160000,
              period: "year",
              certainty: "medium",
              reason: "x",
            },
          }
        : {
            // A made-up quote is ignored, and the estimate is kept.
            stated: { min: 90000, max: 110000, period: "year", quote: "$90,000 - $110,000" },
            estimate: {
              min: 80000,
              max: 100000,
              period: "year",
              certainty: "low",
              reason: "Vague.",
            },
          },
    );
    restore = fake.restore;
    expect(await estimateMissingPay()).toBe(2);

    const [affirm] = await db().select().from(jobs).where(eq(jobs.company, "Affirm"));
    expect(affirm).toMatchObject({
      payMin: 133000,
      payMax: 183000,
      payPeriod: "year",
      payStatedIn: "description",
      payEstimateCertainty: null,
    });
    if (!affirm) throw new Error("job");
    expect(payText(affirm)).toBe("$133,000–$183,000 per year");
    const [other] = await db().select().from(jobs).where(eq(jobs.company, "Other"));
    expect(other).toMatchObject({
      payPeriod: null,
      payEstimateMin: 80000,
      payEstimateCertainty: "low",
    });

    // The $150k firm minimum is now checked against stated pay: 133k-183k meets it at the top.
    const [match] = await db().select().from(jobMatches).where(eq(jobMatches.jobId, affirm.id));
    expect(match).toMatchObject({ firmLimitResult: "pass", unknownFields: [] });
  });
});
