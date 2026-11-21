import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { resumeBodySchema } from "./body";
import { coverLetterToDocx, resumeToDocx } from "./docx";
import { layoutSchema } from "./layout";

const xmlOf = (file: Buffer) =>
  strFromU8(unzipSync(new Uint8Array(file))["word/document.xml"] ?? new Uint8Array());
const line = (text: string) => ({ id: text, text, sources: [], origin: "profile" as const });

describe("Word export", () => {
  test("a resume keeps its content, links, grouping and page breaks", async () => {
    const body = resumeBodySchema.parse({
      kind: "resume",
      name: "Ann Lee",
      contact: "a@example.com",
      contactParts: [{ kind: "email", text: "a@example.com" }],
      links: [{ label: "annlee", url: "https://linkedin.com/in/annlee" }],
      summary: [line("Developer with four years of experience.")],
      sections: [
        {
          id: "s1",
          heading: "Experience",
          groupable: true,
          entries: [
            {
              id: "e1",
              itemId: null,
              title: "Senior Developer",
              subtitle: "Acme",
              dates: "Jan 2025 – Present",
              lines: [line("Cut costs 40%.")],
            },
            {
              id: "e2",
              itemId: null,
              title: "Developer",
              subtitle: "Acme",
              dates: "Jan 2023 – Dec 2024",
              lines: [line("Built reports.")],
            },
          ],
        },
        { id: "s2", heading: "Projects", breakBefore: true, entries: [] },
      ],
      skills: [line("SQL, TypeScript")],
    });
    const xml = xmlOf(await resumeToDocx(body, layoutSchema.parse({ headerLinks: "label" })));
    for (const text of [
      "Ann Lee",
      "annlee",
      "EXPERIENCE",
      "Senior Developer",
      "Cut costs 40%.",
      "SQL, TypeScript",
      "Jan 2023 – Present",
    ]) {
      expect(xml).toContain(text);
    }
    // Two titles at one employer print it once, as the group heading.
    expect(xml.match(/>Acme</g)).toHaveLength(1);
    expect(xml).toContain("<w:pageBreakBefore");
    expect(xml).toContain("<w:keepNext");
    expect(xml).toContain("<w:keepLines");
    expect(xml).toContain("<w:hyperlink");
  });

  test("a cover letter keeps its paragraphs", async () => {
    const xml = xmlOf(
      await coverLetterToDocx({
        kind: "cover_letter",
        name: "Ann Lee",
        contact: "a@example.com",
        links: [],
        greeting: "Dear Hiring Team,",
        paragraphs: [line("I build billing systems.")],
        closing: "Sincerely,",
      }),
    );
    expect(xml).toContain("Dear Hiring Team,");
    expect(xml).toContain("I build billing systems.");
  });
});
