import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  Packer,
  PageNumber,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import type { CoverLetterBody, ResumeBody, ResumeEntry } from "./body";
import { fonts } from "./fonts";
import { platformOf } from "./icons";
import { defaultLayout, type Layout, resolvedStyle } from "./layout";
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
  const r = resolvedStyle(layout);
  const t = layout.template;
  return {
    font: fonts[r.font].docx,
    size: Math.round(r.fontPt * 2),
    nameSize: Math.round(r.namePt * 2),
    accent: r.accent.slice(1).toUpperCase(),
    margin: { y: twips(r.marginIn.y), x: twips(r.marginIn.x) },
    contentWidth: pageWidth - 2 * twips(r.marginIn.x),
    centred: t === "classic" || t === "harvard",
    /** Headings with a rule beneath them. */
    ruled: t === "classic" || t === "harvard" || t === "modern",
    /** A rule under the header block. */
    headerRule: t === "clean",
    harvard: t === "harvard",
    repeatHeader: layout.repeatHeader,
    pageNumbers: layout.pageNumbers,
  };
}

type Setup = ReturnType<typeof setup>;

function headerParagraphs(
  body: Pick<ResumeBody, "name" | "contact" | "links" | "contactParts">,
  layout: Layout,
  s: Setup,
): Paragraph[] {
  const centred = s.centred;
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
      children: [new TextRun({ text: body.name, bold: true, size: s.nameSize, color: s.accent })],
    }),
    new Paragraph({
      alignment,
      spacing: { after: 160 },
      border: s.headerRule
        ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 4 } }
        : undefined,
      children: runs,
    }),
  ];
}

const heading = (text: string, breakBefore: boolean, s: Setup) =>
  new Paragraph({
    pageBreakBefore: breakBefore,
    keepNext: true,
    spacing: { before: 240, after: 80 },
    border: s.ruled
      ? {
          bottom: {
            style: BorderStyle.SINGLE,
            size: s.harvard ? 6 : 8,
            color: s.harvard ? "000000" : s.accent,
            space: 2,
          },
        }
      : undefined,
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: s.harvard ? s.size : 20,
        characterSpacing: s.harvard ? 12 : 20,
        color: s.accent,
      }),
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

function entryParagraphs(
  entry: ResumeEntry,
  inGroup: boolean,
  contentWidth: number,
  s?: Setup,
): Paragraph[] {
  // Harvard: the employer in bold with the dates, then the title in italics.
  if (s?.harvard && !inGroup && entry.subtitle) {
    return [
      entryHead(entry.subtitle, "", entry.dates, entry.url, contentWidth, {}),
      new Paragraph({
        keepNext: true,
        children: [new TextRun({ text: entry.title, italics: true })],
      }),
      ...entry.lines.map((l) => bullet(l.text)),
    ];
  }
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
  const blocks: Paragraph[][] = body.sections.map((section) => {
    const groups =
      section.groupable && layout.groupRoles
        ? groupEntries(section.entries)
        : section.entries.map((e) => [e]);
    const out = [heading(section.heading, section.breakBefore ?? false, s)];
    for (const group of groups) {
      const [only] = group;
      if (group.length === 1 && only) {
        out.push(...entryParagraphs(only, false, s.contentWidth, s));
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
      heading(body.skillsHeading || "Skills", body.skillsBreakBefore ?? false, s),
      new Paragraph({ text: body.skills.map((l) => l.text).join(" · ") }),
    ];
    blocks.splice(Math.min(body.skillsAt ?? blocks.length, blocks.length), 0, skills);
  }
  const summary = body.summary.length
    ? [new Paragraph({ text: body.summary.map((l) => l.text).join(" "), spacing: { after: 120 } })]
    : [];
  return pack(s, headerParagraphs(body, layout, s), [...summary, ...blocks.flat()]);
}

export async function coverLetterToDocx(
  body: CoverLetterBody,
  layout: Layout = defaultLayout,
): Promise<Buffer> {
  const s = setup(layout);
  const date = new Date().toLocaleDateString("en-CA", {
    dateStyle: "long",
    timeZone: "America/Edmonton",
  });
  const para = (text: string) => new Paragraph({ text, spacing: { after: 220 } });
  return pack(s, headerParagraphs(body, layout, s), [
    para(date),
    para(body.greeting),
    ...body.paragraphs.map((p) => para(p.text)),
    new Paragraph({
      children: [new TextRun(body.closing), new TextRun({ text: body.name, break: 1 })],
    }),
  ]);
}

function pack(s: Setup, header: Paragraph[], children: Paragraph[]): Promise<Buffer> {
  const footers = s.pageNumbers
    ? {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES],
                  size: 16,
                  color: "666666",
                }),
              ],
            }),
          ],
        }),
      }
    : undefined;
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
        // A repeated header goes in Word's page header, so it prints on every page.
        headers: s.repeatHeader ? { default: new Header({ children: header }) } : undefined,
        footers,
        children: s.repeatHeader ? children : [...header, ...children],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
