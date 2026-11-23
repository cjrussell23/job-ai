import { describe, expect, test } from "vitest";
import type { ResumeBody } from "./body";
import { fontFile } from "./fonts";
import { layoutSchema, readLayout, resolvedStyle } from "./layout";
import { pdfDecorations, renderResume } from "./render";

const body: ResumeBody = {
  kind: "resume",
  name: "Jane Doe",
  contact: "jane@example.com",
  contactParts: [{ kind: "email", text: "jane@example.com" }],
  links: [],
  summary: [],
  sections: [
    {
      id: "s1",
      heading: "Experience",
      groupable: true,
      entries: [
        {
          id: "e1",
          itemId: null,
          title: "Developer",
          subtitle: "Acme",
          dates: "2022 – Present",
          lines: [{ id: "l1", text: "Built things.", sources: [], origin: "profile" }],
        },
      ],
    },
  ],
  skills: [],
};

describe("templates and style options", () => {
  test("layouts saved before these options read with the old look", () => {
    const old = readLayout({ pages: 2, density: "compact", template: "classic" });
    expect(old).toMatchObject({ font: "template", fontSize: null, margins: null, accent: null });
    expect(resolvedStyle(old)).toMatchObject({
      font: "gelasio",
      fontPt: 9.5,
      marginIn: { y: 0.45, x: 0.55 },
      headerIn: 0,
      footerIn: 0,
    });
  });

  test("member choices override the template and spacing", () => {
    const layout = layoutSchema.parse({
      template: "harvard",
      font: "garamond",
      fontSize: 11,
      margins: { y: 1, x: 0.8 },
      accent: "#0b5394",
      repeatHeader: true,
      pageNumbers: true,
    });
    const r = resolvedStyle(layout);
    expect(r).toMatchObject({
      font: "garamond",
      fontPt: 11,
      marginIn: { y: 1, x: 0.8 },
      accent: "#0b5394",
    });
    expect(r.headerIn).toBeGreaterThan(0.3);
    const html = renderResume(body, { layout });
    expect(html).toContain('"EB Garamond"');
    expect(html).toContain("font-size: 11pt");
    // The page margin makes room for the header and page numbers printed in it.
    expect(html).toContain(`margin: ${1 + r.headerIn}in 0.8in 1.25in`);
    // The header moves out of the document into every page's margin.
    expect(html).not.toContain("<header>");
    expect(renderResume(body, { layout, preview: true })).toContain("<header>");
    const decorations = pdfDecorations(body, layout, (f) => `data:${f}`);
    expect(decorations.headerTemplate).toContain("Jane Doe");
    expect(decorations.headerTemplate).toContain("data:eb-garamond-latin-400-normal.woff2");
    expect(decorations.footerTemplate).toContain('class="totalPages"');
  });

  test("Harvard puts the employer first and the title in italics beneath it", () => {
    const html = renderResume(body, { layout: layoutSchema.parse({ template: "harvard" }) });
    expect(html.indexOf("Acme")).toBeLessThan(html.indexOf("Developer"));
    expect(html).toContain('<div class="entry-role">Developer</div>');
  });

  test("only bundled font files can be served", () => {
    expect(fontFile("tinos-latin-700-italic.woff2")).toEqual({
      pkg: "tinos",
      file: "tinos-latin-700-italic.woff2",
    });
    expect(fontFile("../../package.json")).toBeNull();
  });

  test("bad colours and margins are rejected", () => {
    expect(layoutSchema.safeParse({ accent: "red" }).success).toBe(false);
    expect(layoutSchema.safeParse({ margins: { y: 0.1, x: 0.5 } }).success).toBe(false);
  });
});
