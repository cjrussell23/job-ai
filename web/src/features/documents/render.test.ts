import { describe, expect, test } from "vitest";
import { resumeBodySchema } from "./body";
import { layoutSchema } from "./layout";
import { renderResumeText } from "./render";

const line = (text: string) => ({ id: text, text, sources: [], origin: "profile" as const });

const body = resumeBodySchema.parse({
  kind: "resume",
  name: "Ann Lee",
  contact: "a@example.com",
  links: [],
  summary: [],
  skills: [],
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
  ],
});

describe("plain-text resume", () => {
  test("titles at one employer print it once, as the PDF and Word file do", () => {
    const text = renderResumeText(body, layoutSchema.parse({ groupRoles: true }));
    expect(text.match(/Acme/g)).toHaveLength(1);
    expect(text).toContain("Acme | Jan 2023 – Present\nSenior Developer | Jan 2025 – Present");
    expect(text).toContain("Developer | Jan 2023 – Dec 2024\n- Built reports.");
  });

  test("with grouping off, each title names its employer", () => {
    const text = renderResumeText(body, layoutSchema.parse({ groupRoles: false }));
    expect(text).toContain("Senior Developer, Acme | Jan 2025 – Present");
    expect(text).toContain("Developer, Acme | Jan 2023 – Dec 2024");
  });
});
