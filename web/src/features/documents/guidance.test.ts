import { describe, expect, test } from "vitest";
import { bulletAdvice } from "@/features/profile/strength";
import {
  bulletCountAdvice,
  bulletRange,
  pageAdvice,
  recommendedPages,
  skillsAdvice,
  yearsOfExperience,
} from "./guidance";

const now = new Date("2026-11-21T12:00:00Z");

describe("resume guidance", () => {
  test("bullets of one or two lines pass; longer or very short ones get advice", () => {
    expect(
      bulletAdvice("Built a reporting tool that saved the support team ten hours a week."),
    ).toBeNull();
    expect(bulletAdvice("x".repeat(250))?.status).toBe("warn");
    expect(bulletAdvice("Did reports")?.status).toBe("warn");
  });

  test("recent roles get more bullets than old ones; projects get few", () => {
    const role = (endDate: string, rank: number) =>
      bulletRange({ type: "role", startDate: "", endDate, rank }, now);
    expect(role("Present", 0)).toEqual({ min: 3, max: 6 });
    expect(role("Dec 2023", 2)).toEqual({ min: 2, max: 4 });
    expect(role("2012", 4)).toEqual({ min: 0, max: 2 });
    expect(bulletRange({ type: "project", startDate: "", endDate: "", rank: -1 }, now)).toEqual({
      min: 1,
      max: 3,
    });
    expect(bulletCountAdvice(8, { min: 3, max: 6 }).status).toBe("warn");
    expect(bulletCountAdvice(4, { min: 3, max: 6 }).status).toBe("good");
  });

  test("page and skills advice", () => {
    expect(yearsOfExperience(["Jan 2022", "Jan 2025", "not a date"], now)).toBe(4);
    expect(recommendedPages(4)).toBe(1);
    expect(recommendedPages(9)).toBe(2);
    expect(pageAdvice(2, 1).status).toBe("warn");
    expect(pageAdvice(1, 1).status).toBe("good");
    expect(skillsAdvice(12)).toBeNull();
    expect(skillsAdvice(40)?.status).toBe("warn");
  });
});
