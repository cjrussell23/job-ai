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
