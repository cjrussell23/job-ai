import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { createJobSpySource } from "./jobspy";
import { parsePostings } from "./source";

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8"),
  );

describe("JobSpy source", () => {
  test.each([
    ["indeed", "jobspy-indeed.json"],
    ["linkedin", "jobspy-linkedin.json"],
  ] as const)("%s results map to the common posting shape", async (site, file) => {
    const calls: Record<string, unknown>[] = [];
    const source = createJobSpySource(site, async (body) => {
      calls.push(body);
      return fixture(file);
    });
    const { postings, rejected } = parsePostings(
      await source.search({ title: "software developer", location: "Calgary, AB" }),
    );
    expect(rejected).toBe(0);
    expect(postings).toHaveLength(2);
    for (const posting of postings) {
      expect(posting.location).toMatch(/^Calgary/);
      expect(posting.location).not.toMatch(/Canada$/);
      expect(posting.description.length).toBeGreaterThan(100);
    }
    expect(calls[0]).toMatchObject({
      site,
      search_term: "software developer",
      location: "Calgary, AB",
    });
  });

  test("Indeed pay is read with its period", async () => {
    const source = createJobSpySource("indeed", async () => fixture("jobspy-indeed.json"));
    const { postings } = parsePostings(
      await source.search({ title: "x", location: "Calgary, AB" }),
    );
    expect(postings[0]?.pay).toEqual({ min: 55000, max: 65000, period: "year" });
  });

  test("a failed search is an error for the run log, not an empty result", async () => {
    const source = createJobSpySource("linkedin", async () => ({
      jobs: [],
      error: "HTTPError: 429",
    }));
    await expect(source.search({ title: "x", location: "y" })).rejects.toThrow("429");
  });
});
