import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { companyBoardChecks } from "@/db/schema";
import { ingestPostings } from "@/features/jobs/ingest";
import { createMatches } from "@/features/scoring/score";
import { approveSearchTitles, createTarget } from "@/features/targets/targets";
import { resetDb } from "@/test/db";
import { createMember } from "@/test/fixtures";
import { checkCompanyBoards, slugCandidates, suggestedCompaniesFor } from "./company-suggestions";
import type { Fetcher } from "./http";
import { parsePostings } from "./source";
import { addWatchedCompany } from "./watched-companies";

beforeEach(resetDb);
afterAll(closeDb);

// Only Affirm has a board, on Ashby, with two jobs.
const fetcher: Fetcher = {
  text: async () => {
    throw new Error("not used");
  },
  json: async (url) => {
    if (url.includes("job-board/affirm")) return { jobs: [{ title: "a" }, { title: "b" }] };
    throw new Error("404");
  },
};
const noPause = async () => {};

describe("suggested companies", () => {
  test("board ids are tried from the company name", () => {
    expect(slugCandidates("Affirm, Inc.")).toEqual(["affirm"]);
    expect(slugCandidates("Bean Co. Roasters")).toEqual(["beanroasters", "bean-roasters"]);
  });

  test("companies in matches are checked once, and members see found boards for their own matches", async () => {
    const userId = await createMember("a@example.com");
    const target = await createTarget(userId, {
      roleType: "Developer",
      locations: ["Calgary, AB"],
    });
    if (!target.ok) throw new Error("target");
    await approveSearchTitles(userId, target.id, ["Developer"]);
    const other = await createMember("b@example.com");
    const { postings } = parsePostings(
      ["Affirm Inc.", "Nobody Ltd"].map((company, i) => ({
        url: `https://ca.indeed.com/viewjob?jk=${i}`,
        title: "Developer",
        company,
        location: "Calgary, AB",
        description: "x",
      })),
    );
    await ingestPostings("indeed", postings, new Date(), "Developer");
    await createMatches();

    expect(await checkCompanyBoards({ fetcher, pause: noPause })).toEqual({ checked: 2, found: 1 });
    // Checked companies aren't checked again for a while.
    expect(await checkCompanyBoards({ fetcher, pause: noPause })).toEqual({ checked: 0, found: 0 });
    expect(await db().select().from(companyBoardChecks)).toHaveLength(2);

    const mine = await suggestedCompaniesFor(userId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      companyName: "Affirm Inc.",
      system: "ashby",
      boardId: "affirm",
      openJobs: 2,
      yourMatches: 1,
      url: "https://jobs.ashbyhq.com/affirm",
    });
    expect(await suggestedCompaniesFor(other)).toEqual([]);

    // Once watched, it's no longer a suggestion.
    await addWatchedCompany("https://jobs.ashbyhq.com/affirm", { fetcher });
    expect(await suggestedCompaniesFor(userId)).toEqual([]);
  });
});
