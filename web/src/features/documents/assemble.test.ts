import { describe, expect, test } from "vitest";
import type { ProfileItem } from "@/features/profile/profile";
import { assembleCoverLetter, assembleResume, itemsForPrompt, usableItems } from "./assemble";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function item(n: number, overrides: Partial<ProfileItem>): ProfileItem {
  return {
    id: id(n),
    userId: "u",
    type: "bullet",
    parentId: null,
    title: "",
    organization: "",
    content: "",
    shortContent: "",
    alternateTitles: [],
    url: "",
    startDate: "",
    endDate: "",
    tags: [],
    visibility: "auto",
    source: "manual",
    position: n,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const items = [
  item(1, {
    type: "role",
    title: "Software Developer",
    organization: "Acme",
    startDate: "2023",
    endDate: "Present",
  }),
  item(2, { parentId: id(1), content: "Built the billing API" }),
  item(3, { type: "skill", title: "TypeScript" }),
  item(4, {
    type: "story",
    title: "Why I code",
    content: "I love it",
    visibility: "cover_letter_only",
  }),
  item(5, { type: "note", content: "Secret side gig", visibility: "never" }),
];
const header = { name: "Jane Doe", contact: "jane@example.com", links: [] };
const stranger = "11111111-1111-4111-8111-111111111111";

describe("usable items", () => {
  test("never-include items are never used; cover-letter-only items only on letters", () => {
    expect([...usableItems(items, "resume").keys()]).toEqual([id(1), id(2), id(3)]);
    expect([...usableItems(items, "cover_letter").keys()]).toEqual([id(1), id(2), id(3), id(4)]);
    expect(itemsForPrompt(usableItems(items, "resume"))).not.toContain("Secret side gig");
  });
});

describe("assembling a resume", () => {
  test("headings come from the profile and every line keeps its sources", () => {
    const { body, report } = assembleResume(
      {
        summary: [],
        sections: [
          {
            heading: "Experience",
            entries: [
              {
                itemId: id(1),
                bullets: [{ text: "Built the billing API", sources: [id(2)], reworded: false }],
              },
            ],
          },
        ],
        skills: [{ text: "TypeScript", sources: [id(3)], reworded: false }],
      },
      items,
      header,
    );
    expect(report).toEqual({ kept: 2, dropped: 0 });
    const entry = body.sections[0]?.entries[0];
    expect(entry).toMatchObject({
      itemId: id(1),
      title: "Software Developer",
      subtitle: "Acme",
      dates: "2023 – Present",
    });
    expect(entry?.lines[0]).toMatchObject({
      text: "Built the billing API",
      sources: [id(2)],
      origin: "profile",
    });
  });

  test("lines citing nothing, unknown items, never-include or letter-only items are dropped", () => {
    const { body, report } = assembleResume(
      {
        summary: [{ text: "Award-winning engineer", sources: [], reworded: true }],
        sections: [
          {
            heading: "Experience",
            entries: [
              {
                itemId: id(1),
                bullets: [
                  { text: "Led a team of 20", sources: [stranger], reworded: true },
                  { text: "Runs a side gig", sources: [id(5)], reworded: true },
                  { text: "Loves coding", sources: [id(4)], reworded: true },
                  { text: "Built and owned billing", sources: [id(2)], reworded: true },
                ],
              },
              // An entry pointing at a skill, or at nothing real, is dropped with its bullets.
              { itemId: id(3), bullets: [{ text: "x", sources: [id(3)], reworded: false }] },
              { itemId: stranger, bullets: [{ text: "y", sources: [id(2)], reworded: false }] },
            ],
          },
        ],
        skills: [],
      },
      items,
      header,
    );
    expect(body.summary).toEqual([]);
    expect(body.sections[0]?.entries).toHaveLength(1);
    expect(body.sections[0]?.entries[0]?.lines.map((l) => [l.text, l.origin])).toEqual([
      ["Built and owned billing", "reworded"],
    ]);
    expect(report).toEqual({ kept: 1, dropped: 6 });
  });
});

describe("assembling a cover letter", () => {
  test("letter-only items may be cited; invented sources drop the paragraph; role-only paragraphs may cite nothing", () => {
    const { body, report } = assembleCoverLetter(
      {
        greeting: "Dear Hiring Team,",
        paragraphs: [
          { text: "I'm applying for the developer role at Acme.", sources: [] },
          { text: "I built the billing API and I love coding.", sources: [id(2), id(4)] },
          { text: "I led a team of 20.", sources: [stranger] },
        ],
        closing: "Sincerely,",
      },
      items,
      header,
    );
    expect(body.paragraphs.map((p) => p.sources)).toEqual([[], [id(2), id(4)]]);
    expect(report).toEqual({ kept: 2, dropped: 1 });
  });
});
