import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import type { CoverLetterBody, ResumeBody, ResumeEntry } from "./body";
import { platformOf } from "./icons";
import { defaultLayout, densityStyles, type Layout } from "./layout";
import { groupEntries, spanOf } from "./render";

/**
 * Word versions of resumes and cover letters, following the same layout as the PDF:
 * fonts, spacing, section order, grouping, headings and page breaks. Icons are left
 * out; Word documents are mostly sent to applicant tracking systems, which read text.
 */

const twips = (inches: number) => Math.round(inches * 1440);
const pageWidth = twips(8.5);
const isWeb = (url: string | undefined): url is string => !!url && /^https?:\/\//i.test(url);
const linkText = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

function setup(layout: Layout) {
  const d = densityStyles[layout.density];
  const font = layout.template === "classic" ? "Georgia" : "Arial";
  return {
    font,
    size: Math.round(d.fontPt * 2),
    margin: { y: twips(d.marginIn.y), x: twips(d.marginIn.x) },
    contentWidth: pageWidth - 2 * twips(d.marginIn.x),
    centred: layout.template === "classic",
  };
}

function headerParagraphs(
  body: Pick<ResumeBody, "name" | "contact" | "links" | "contactParts">,
  layout: Layout,
  centred: boolean,
): Paragraph[] {
  const details = body.contactParts?.length
    ? body.contactParts.map((p) => p.text)
    : body.contact
      ? [body.contact]
      : [];
  const runs: (TextRun | ExternalHyperlink)[] = [];
  const add = (child: TextRun | ExternalHyperlink) => {
    if (runs.length) runs.push(new TextRun({ text: " · ", color: "555555" }));
    runs.push(child);
  };
  for (const text of details) add(new TextRun({ text, color: "555555" }));
  for (const link of body.links.filter((l) => isWeb(l.url))) {
    const text =
      layout.headerLinks === "label" ? link.label || platformOf(link.url).name : linkText(link.url);
    add(
      new ExternalHyperlink({
        link: link.url,
        children: [new TextRun({ text, color: "555555" })],
      }),
    );
  }
  const alignment = centred ? AlignmentType.CENTER : AlignmentType.LEFT;
  return [
    new Paragraph({
      alignment,
      children: [new TextRun({ text: body.name, bold: true, size: 36 })],
    }),
    new Paragraph({
      alignment,
      spacing: { after: 160 },
      border: centred
        ? undefined
        : { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 4 } },
      children: runs,
    }),
  ];
}

const heading = (text: string, breakBefore: boolean, classic: boolean) =>
  new Paragraph({
    pageBreakBefore: breakBefore,
    keepNext: true,
    spacing: { before: 240, after: 80 },
    border: classic
      ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 2 } }
      : undefined,
    children: [
      new TextRun({ text: text.toUpperCase(), bold: true, size: 20, characterSpacing: 20 }),
    ],
  });

function entryHead(
  title: string,
  subtitle: string,
  dates: string,
  url: string | undefined,
  contentWidth: number,
  style: { italic?: boolean },
): Paragraph {
  const children: (TextRun | ExternalHyperlink)[] = [
    new TextRun({ text: title, bold: !style.italic, italics: style.italic }),
  ];
  if (subtitle) children.push(new TextRun({ text: ` · ${subtitle}`, color: "444444" }));
  if (isWeb(url)) {
    children.push(new TextRun({ text: "  " }));
    children.push(
      new ExternalHyperlink({
        link: url,
        children: [new TextRun({ text: linkText(url), color: "444444" })],
      }),
    );
  }
  if (dates) children.push(new TextRun({ text: `\t${dates}`, color: "555555" }));
  return new Paragraph({
    keepNext: true,
    spacing: { before: 100 },
    tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
    children,
  });
}

const bullet = (text: string) =>
  // keepLines: a bullet never breaks across pages.
  new Paragraph({ text, bullet: { level: 0 }, keepLines: true, spacing: { after: 20 } });

function entryParagraphs(entry: ResumeEntry, inGroup: boolean, contentWidth: number): Paragraph[] {
  return [
    entryHead(entry.title, inGroup ? "" : entry.subtitle, entry.dates, entry.url, contentWidth, {
      italic: inGroup,
    }),
    ...entry.lines.map((l) => bullet(l.text)),
  ];
}

export async function resumeToDocx(
  body: ResumeBody,
  layout: Layout = defaultLayout,
): Promise<Buffer> {
  const s = setup(layout);
  const classic = layout.template === "classic";
  const blocks: Paragraph[][] = body.sections.map((section) => {
    const groups =
      section.groupable && layout.groupRoles
        ? groupEntries(section.entries)
        : section.entries.map((e) => [e]);
    const out = [heading(section.heading, section.breakBefore ?? false, classic)];
    for (const group of groups) {
      const [only] = group;
      if (group.length === 1 && only) {
        out.push(...entryParagraphs(only, false, s.contentWidth));
        continue;
      }
      out.push(
        entryHead(group[0]?.subtitle ?? "", "", spanOf(group), undefined, s.contentWidth, {}),
      );
      for (const entry of group) out.push(...entryParagraphs(entry, true, s.contentWidth));
    }
    return out;
  });
  if (body.skills.length) {
    const skills = [
      heading(body.skillsHeading || "Skills", body.skillsBreakBefore ?? false, classic),
      new Paragraph({ text: body.skills.map((l) => l.text).join(" · ") }),
    ];
    blocks.splice(Math.min(body.skillsAt ?? blocks.length, blocks.length), 0, skills);
  }
  const summary = body.summary.length
    ? [new Paragraph({ text: body.summary.map((l) => l.text).join(" "), spacing: { after: 120 } })]
    : [];
  return pack(s, [...headerParagraphs(body, layout, s.centred), ...summary, ...blocks.flat()]);
}

export async function coverLetterToDocx(body: CoverLetterBody): Promise<Buffer> {
  const s = setup(defaultLayout);
  const date = new Date().toLocaleDateString("en-CA", {
    dateStyle: "long",
    timeZone: "America/Edmonton",
  });
  const para = (text: string) => new Paragraph({ text, spacing: { after: 220 } });
  return pack(s, [
    ...headerParagraphs(body, defaultLayout, false),
    para(date),
    para(body.greeting),
    ...body.paragraphs.map((p) => para(p.text)),
    new Paragraph({
      children: [new TextRun(body.closing), new TextRun({ text: body.name, break: 1 })],
    }),
  ]);
}

function pack(s: ReturnType<typeof setup>, children: Paragraph[]): Promise<Buffer> {
  const doc = new Document({
    styles: { default: { document: { run: { font: s.font, size: s.size } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: pageWidth, height: twips(11) },
            margin: { top: s.margin.y, bottom: s.margin.y, left: s.margin.x, right: s.margin.x },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
