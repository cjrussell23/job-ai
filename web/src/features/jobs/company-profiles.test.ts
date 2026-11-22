import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { companyProfiles } from "@/db/schema";
import { parsePostings } from "@/features/sources/source";
import { resetDb } from "@/test/db";
import { fakeModel } from "@/test/fake-model";
import { describeOne, profileOf, profilesFor, realSources } from "./company-profiles";
import { ingestPostings } from "./ingest";

let restore = () => {};
beforeEach(resetDb);
afterEach(() => restore());
afterAll(closeDb);

describe("company descriptions", () => {
  test("only links the search returned are kept as sources", () => {
    expect(
      realSources(
        [
          { title: "Site", url: "https://www.acme.com/about/" },
          { title: "Made up", url: "https://acme-reviews.example/acme" },
          { title: "Again", url: "http://acme.com/about" },
        ],
        ["https://acme.com/about", "https://linkedin.com/company/acme"],
      ),
    ).toEqual([{ title: "Site", url: "https://www.acme.com/about/" }]);
  });

  test("a description is saved once per company and found again by any spelling of its name", async () => {
    const { postings } = parsePostings([
      {
        url: "https://ca.indeed.com/viewjob?jk=1",
        title: "Developer",
        company: "Acme Inc.",
        location: "Calgary, AB",
        description: "x",
      },
    ]);
    await ingestPostings("indeed", postings);
    const fake = fakeModel({
      summary: "Acme makes billing software for utilities.",
      industry: "Software",
      employees: "201-500 (LinkedIn)",
      reviews: { rating: 4.1, outOf: 5, site: "Glassdoor", summary: "Good balance." },
      notable: ["Raised a Series B in 2025."],
      sources: [{ title: "Acme", url: "https://acme.com" }],
      confidence: "medium",
    });
    restore = fake.restore;
    expect(await describeOne("Acme Inc.")).toBe(true);
    // The fake model ran no search, so no source can be confirmed.
    const profile = profileOf(await profilesFor(["ACME"]), "Acme");
    expect(profile?.facts).toMatchObject({
      industry: "Software",
      employees: "201-500 (LinkedIn)",
      confidence: "medium",
    });
    expect(profile?.sources).toEqual([]);
    expect(JSON.stringify(fake.calls[0]?.prompt)).toContain("Calgary, AB");
    await describeOne("Acme Inc.");
    expect(await db().select().from(companyProfiles)).toHaveLength(1);
  });
});
