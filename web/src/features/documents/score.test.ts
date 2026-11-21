import { describe, expect, test } from "vitest";
import { scoreResume } from "./score";

const strong = "Cut invoice errors by 40% across 3,000 accounts by rebuilding billing checks.";

describe("resume score", () => {
  test("a complete, tight resume scores high and each gap lowers its own aspect", () => {
    const base = {
      pages: 1,
      targetPages: 1,
      entries: [
        {
          kind: "role" as const,
          bullets: [strong, strong.replace("Cut", "Grew"), strong.replace("Cut", "Saved")],
          range: { min: 3, max: 6 },
        },
      ],
      contact: { email: true, phone: true, location: true, links: 1 },
      hasSummary: true,
      skills: 12,
    };
    const good = scoreResume(base);
    expect(good.total).toBe(100);
    const long = scoreResume({ ...base, pages: 2 });
    expect(long.aspects.find((a) => a.key === "length")?.score).toBe(55);
    const vague = scoreResume({
      ...base,
      entries: [{ kind: "role", bullets: ["Responsible for reports"], range: { min: 3, max: 6 } }],
      contact: { ...base.contact, phone: false },
    });
    const by = Object.fromEntries(vague.aspects.map((a) => [a.key, a.score]));
    expect(by.impact).toBe(0);
    expect(by.wording).toBe(0);
    expect(by.structure).toBe(0);
    expect(by.completeness).toBe(83);
    expect(vague.aspects.find((a) => a.key === "completeness")?.detail).toContain("a phone number");
    expect(vague.total).toBeLessThan(good.total);
  });
});

describe("scoring a saved resume", () => {
  test("experience entries count as roles and contact parts count", async () => {
    const { scoreBody } = await import("./score");
    const { resumeBodySchema } = await import("./body");
    const line = (text: string) => ({ id: text, text, sources: [], origin: "profile" as const });
    const body = resumeBodySchema.parse({
      kind: "resume",
      name: "Ann",
      contact: "a@example.com",
      contactParts: [{ kind: "email", text: "a@example.com" }],
      links: [],
      summary: [],
      sections: [
        {
          id: "s",
          heading: "Experience",
          entries: [
            {
              id: "e",
              itemId: null,
              title: "Dev",
              subtitle: "Acme",
              dates: "Jan 2024 – Present",
              lines: [line(strong), line(strong), line(strong)],
            },
          ],
        },
      ],
      skills: [line("SQL, TypeScript, React")],
    });
    const score = scoreBody(body, 1);
    const by = Object.fromEntries(score.aspects.map((a) => [a.key, a.score]));
    expect(by.structure).toBe(100);
    expect(by.impact).toBe(100);
    expect(score.aspects.find((a) => a.key === "completeness")?.detail).toContain("a phone number");
  });
});
