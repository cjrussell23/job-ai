import type { CoverLetterBody, DocumentBody, ResumeBody, ResumeEntry } from "./body";
import { fontFaceCss, fontStack } from "./fonts";
import { type IconName, iconSvg, platformOf } from "./icons";
import { defaultLayout, type Layout, resolvedStyle, type Template } from "./layout";

/**
 * Print-ready templates (see `templates` in layout.ts), styled by the layout's spacing and
 * the member's font, size, margin and colour choices. Single column with standard
 * headings, so applicant tracking systems read them in order.
 */

const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const templateCss: Record<Template, string> = {
  clean: "",
  classic: `
  header { text-align: center; border-bottom: none; }
  h1 { letter-spacing: 0.04em; }
  h2 { border-bottom: 1px solid #999; padding-bottom: 2pt; letter-spacing: 0.12em; }
`,
  harvard: `
  header { text-align: center; border-bottom: none; padding-bottom: 2pt; margin-bottom: 6pt; }
  h1 { letter-spacing: 0.03em; }
  .contact { color: #111; }
  h2 { font-variant: small-caps; text-transform: none; font-size: 1.12em; letter-spacing: 0.03em;
    border-bottom: 1px solid currentColor; padding-bottom: 1pt; margin: 10pt 0 5pt; }
  .entry-title { font-weight: 700; }
  .entry-role { font-style: italic; }
  .dates { color: #111; }
  .group .entry-title { font-style: italic; font-weight: 400; }
`,
  modern: `
  header { border-bottom: none; padding-bottom: 2pt; }
  h1 { color: var(--accent); font-weight: 700; letter-spacing: 0; }
  h2 { color: var(--accent); border-bottom: 2px solid var(--accent); padding-bottom: 2pt; letter-spacing: 0.1em; }
  .entry-title { font-weight: 700; }
  .icon { color: var(--accent); }
`,
  minimal: `
  header { border-bottom: none; margin-bottom: 6pt; }
  h1 { font-weight: 400; letter-spacing: 0.01em; }
  h2 { color: #666; font-size: 0.85em; letter-spacing: 0.16em; margin: 14pt 0 4pt; }
`,
};

function styles(layout: Layout, preview: boolean, fontSource?: (file: string) => string): string {
  const r = resolvedStyle(layout);
  const top = r.marginIn.y + r.headerIn;
  const bottom = r.marginIn.y + r.footerIn;
  const margin = `${top}in ${r.marginIn.x}in ${bottom}in`;
  return `
  ${fontFaceCss(r.font, fontSource)}
  :root { --accent: ${r.accent}; }
  @page { size: Letter; margin: ${margin}; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: ${fontStack(r.font)}; font-size: ${r.fontPt}pt; line-height: ${r.lineHeight}; color: #111; margin: 0; }
  ${preview ? `html { background: #fff; } body { width: 8.5in; padding: ${r.marginIn.y}in ${r.marginIn.x}in; }` : ""}
  a { color: inherit; text-decoration: none; }
  header { border-bottom: 1px solid #ccc; padding-bottom: 6pt; margin-bottom: 10pt; }
  h1 { font-size: ${r.namePt}pt; margin: 0; letter-spacing: 0.02em; line-height: 1.2; color: var(--accent); }
  .contact { color: #555; font-size: 9.5pt; margin-top: 2pt; }
  h2 { font-size: 0.95em; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); margin: 12pt 0 4pt; }
  .entry { margin-bottom: 7pt; }
  /* Pages may break between bullets, never inside one or straight after a heading. */
  li, p, .entry-head { break-inside: avoid; }
  h2, .entry-head, .entry-role { break-after: avoid; }
  .page-break { break-before: page; }
  .entry-head { display: flex; justify-content: space-between; gap: 12pt; }
  .entry-title { font-weight: 700; }
  .entry-sub { color: #444; }
  .dates { color: #555; white-space: nowrap; font-size: 0.92em; }
  ul { margin: 2pt 0 0; padding-left: 14pt; }
  li { margin: 1pt 0; }
  p { margin: 0 0 9pt; }
  .letter p { margin-bottom: 11pt; }
  .group { margin-bottom: 7pt; }
  .group > .entry-head { margin-bottom: 2pt; }
  .group .entry { margin: 0 0 5pt; }
  .group .entry-title { font-weight: 400; font-style: italic; }
  .entry-link { color: #444; font-size: 0.92em; }
  .contact .item { white-space: nowrap; }
  .icon { width: 0.95em; height: 0.95em; vertical-align: -0.12em; margin-right: 0.3em; color: #555; }
  ${templateCss[layout.template]}
`;
}

export type RenderOptions = {
  layout?: Layout;
  preview?: boolean;
  /** Where font files come from; the app's font route unless given. */
  fontSource?: (file: string) => string;
};

function page(title: string, content: string, options: RenderOptions): string {
  const layout = options.layout ?? defaultLayout;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${styles(layout, options.preview ?? false, options.fontSource)}</style></head><body>${content}</body></html>`;
}

/**
 * A header repeated on every page lives in the PDF's page margin, not in the document,
 * so the preview shows it once at the top and the PDF prints it on each page.
 */
const headerInBody = (options: RenderOptions) =>
  !(options.layout ?? defaultLayout).repeatHeader || (options.preview ?? false);

const linkText = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

function header(
  body: {
    name: string;
    contact: string;
    contactParts?: { kind: "email" | "phone" | "location"; text: string }[];
    links: { label: string; url: string }[];
  },
  layout: Layout,
): string {
  const icon = (name: IconName) => (layout.headerIcons ? iconSvg(name) : "");
  const details = body.contactParts?.length
    ? body.contactParts.map((p) => `<span class="item">${icon(p.kind)}${esc(p.text)}</span>`)
    : body.contact
      ? [esc(body.contact)]
      : [];
  const links = body.links
    // Only web links are printed as links; anything else is left out rather than trusted.
    .filter((l) => /^https?:\/\//i.test(l.url))
    .map((l) => {
      const platform = platformOf(l.url);
      const text = layout.headerLinks === "label" ? l.label || platform.name : linkText(l.url);
      return `<a class="item" href="${esc(l.url)}">${icon(platform.icon)}${esc(text)}</a>`;
    });
  return `<header><h1>${esc(body.name)}</h1><div class="contact">${[...details, ...links].join('<span class="sep"> · </span>')}</div></header>`;
}

type HeaderSource = Parameters<typeof header>[0];

/**
 * Chromium's page header and footer for a PDF: the member's header on every page and page
 * numbers, as each layout asks. Rendered apart from the document, so the font comes as
 * data URIs and every style is stated again.
 */
export function pdfDecorations(
  body: HeaderSource,
  layout: Layout,
  fontSource: (file: string) => string,
): { headerTemplate?: string; footerTemplate?: string } {
  const r = resolvedStyle(layout);
  if (!layout.repeatHeader && !layout.pageNumbers) return {};
  // The page header is a separate document that Chromium prints without waiting for fonts.
  // It gets the font from the same data URIs the page loaded, which are then already in
  // memory; "swap" keeps the text from going blank if they aren't.
  const base = `${fontFaceCss(r.font, fontSource).replaceAll("font-display:block", "font-display:swap")} * { box-sizing: border-box; } .wrap { width: 100%; font-family: ${fontStack(r.font)}; color: #111; -webkit-print-color-adjust: exact; padding: 0 ${r.marginIn.x}in; }`;
  const css = `<style>${base} ${styles(layout, false, fontSource)
    .replace(/@page[^}]*}/, "")
    .replace(/@font-face[^}]*}/g, "")}</style>`;
  const headerTemplate = layout.repeatHeader
    ? `${css}<div class="wrap" style="padding-top:${r.marginIn.y}in;font-size:${r.fontPt}pt;line-height:${r.lineHeight}">${header(body, layout).replace("<header>", '<header style="margin-bottom:0">')}</div>`
    : "<span></span>";
  const footerTemplate = layout.pageNumbers
    ? `${css}<div class="wrap" style="font-size:8pt;color:#666;text-align:center;padding-bottom:${Math.max(0.2, r.marginIn.y - 0.15)}in">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`
    : "<span></span>";
  return { headerTemplate, footerTemplate };
}

const isWeb = (url: string | undefined): url is string => !!url && /^https?:\/\//i.test(url);

function entryHtml(entry: ResumeEntry, inGroup: boolean, template: Template): string {
  const link = isWeb(entry.url)
    ? ` <a class="entry-link" href="${esc(entry.url)}">${esc(linkText(entry.url))}</a>`
    : "";
  const lines = entry.lines.length
    ? `<ul>${entry.lines.map((l) => `<li>${esc(l.text)}</li>`).join("")}</ul>`
    : "";
  // Harvard puts the employer first in bold, with the title in italics beneath it.
  if (template === "harvard" && !inGroup && entry.subtitle) {
    return `<div class="entry"><div class="entry-head"><div><span class="entry-title">${esc(entry.subtitle)}</span>${link}</div><div class="dates">${esc(entry.dates)}</div></div><div class="entry-role">${esc(entry.title)}</div>${lines}</div>`;
  }
  const sub =
    !inGroup && entry.subtitle ? ` <span class="entry-sub">· ${esc(entry.subtitle)}</span>` : "";
  return `<div class="entry"><div class="entry-head"><div><span class="entry-title">${esc(entry.title)}</span>${sub}${link}</div><div class="dates">${esc(entry.dates)}</div></div>${lines}</div>`;
}

const sameEmployer = (a: ResumeEntry, b: ResumeEntry) =>
  a.subtitle !== "" && a.subtitle.toLowerCase().trim() === b.subtitle.toLowerCase().trim();

/** Consecutive entries at one employer, so promotions show under one heading. */
export function groupEntries(entries: ResumeEntry[]): ResumeEntry[][] {
  const groups: ResumeEntry[][] = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    const first = last?.[0];
    if (last && first && sameEmployer(first, entry)) last.push(entry);
    else groups.push([entry]);
  }
  return groups;
}

const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A sortable value for a free-form date; "Present" sorts last, unparseable dates are null. */
function dateValue(text: string): number | null {
  if (/present|current|now/i.test(text)) return Number.POSITIVE_INFINITY;
  const year = text.match(/\b(19|20)\d{2}\b/);
  if (!year) return null;
  const month = months.findIndex((m) => text.toLowerCase().includes(m));
  return Number(year[0]) * 12 + Math.max(0, month);
}

/** "Jan 2023 – Present": the earliest start to the latest end, whatever order is shown. */
export function spanOf(group: ResumeEntry[]): string {
  const starts: string[] = [];
  const ends: string[] = [];
  for (const entry of group) {
    const [start = "", end = start] = entry.dates.split(" – ");
    if (start) starts.push(start);
    if (end) ends.push(end);
  }
  const pick = (list: string[], better: (a: number, b: number) => boolean) =>
    list.reduce<string>((best, d) => {
      const v = dateValue(d);
      const b = dateValue(best);
      return v !== null && (b === null || better(v, b)) ? d : best;
    }, list[0] ?? "");
  const start = pick(starts, (a, b) => a < b);
  const end = pick(ends, (a, b) => a > b);
  return start && end && start !== end ? `${start} – ${end}` : start || end;
}

export function renderResume(body: ResumeBody, options: RenderOptions = {}): string {
  const layout = options.layout ?? defaultLayout;
  const summary = body.summary.length
    ? `<p>${body.summary.map((l) => esc(l.text)).join(" ")}</p>`
    : "";
  const sectionHtml = body.sections.map((section) => {
    const groups =
      section.groupable && layout.groupRoles
        ? groupEntries(section.entries)
        : section.entries.map((e) => [e]);
    const html = groups
      .map((group) => {
        const [only] = group;
        if (group.length === 1 && only) return entryHtml(only, false, layout.template);
        return `<div class="group"><div class="entry-head"><div><span class="entry-title" style="font-style:normal;font-weight:700">${esc(group[0]?.subtitle ?? "")}</span></div><div class="dates">${esc(spanOf(group))}</div></div>${group.map((e) => entryHtml(e, true, layout.template)).join("")}</div>`;
      })
      .join("");
    return `<h2${section.breakBefore ? ' class="page-break"' : ""}>${esc(section.heading)}</h2>${html}`;
  });
  const skills = body.skills.length
    ? `<h2${body.skillsBreakBefore ? ' class="page-break"' : ""}>${esc(body.skillsHeading || "Skills")}</h2><p>${body.skills.map((l) => esc(l.text)).join(" · ")}</p>`
    : "";
  const at = Math.min(body.skillsAt ?? sectionHtml.length, sectionHtml.length);
  const blocks = [...sectionHtml.slice(0, at), skills, ...sectionHtml.slice(at)].join("");
  return page(
    `${body.name} resume`,
    `${headerInBody(options) ? header(body, layout) : ""}${summary}${blocks}`,
    options,
  );
}

/** The resume as plain text, for pasting into an employer's application form. */
export function renderResumeText(body: ResumeBody, layout: Layout = defaultLayout): string {
  const out: string[] = [
    body.name,
    [body.contact, ...body.links.map((l) => l.url)].filter(Boolean).join(" | "),
    "",
  ];
  if (body.summary.length) out.push(body.summary.map((l) => l.text).join(" "), "");
  const entryText = (entry: ResumeEntry, inGroup: boolean) => {
    const head = [entry.title, inGroup ? "" : entry.subtitle].filter(Boolean).join(", ");
    return [
      [head, entry.dates].filter(Boolean).join(" | ") + (entry.url ? ` | ${entry.url}` : ""),
      ...entry.lines.map((line) => `- ${line.text}`),
    ];
  };
  const sections = body.sections.map((section) => {
    const lines = [section.heading.toUpperCase()];
    // Grouped the same way as the PDF and Word file, so the text (and the AI feedback that
    // reads it) shows one employer heading over several titles.
    const groups =
      section.groupable && layout.groupRoles
        ? groupEntries(section.entries)
        : section.entries.map((e) => [e]);
    for (const group of groups) {
      const [only] = group;
      if (group.length === 1 && only) lines.push(...entryText(only, false));
      else {
        lines.push([group[0]?.subtitle ?? "", spanOf(group)].filter(Boolean).join(" | "));
        for (const entry of group) lines.push(...entryText(entry, true));
      }
      lines.push("");
    }
    return lines.join("\n");
  });
  const skills = body.skills.length
    ? `${(body.skillsHeading || "Skills").toUpperCase()}\n${body.skills.map((l) => l.text).join(", ")}\n`
    : "";
  const at = Math.min(body.skillsAt ?? sections.length, sections.length);
  out.push(...sections.slice(0, at), skills, ...sections.slice(at));
  return `${out
    .filter((p, i, all) => !(p === "" && all[i - 1] === ""))
    .join("\n")
    .trim()}\n`;
}

export function renderCoverLetter(body: CoverLetterBody, options: RenderOptions = {}): string {
  const date = new Date().toLocaleDateString("en-CA", {
    dateStyle: "long",
    timeZone: "America/Edmonton",
  });
  return page(
    `${body.name} cover letter`,
    `${headerInBody(options) ? header(body, options.layout ?? defaultLayout) : ""}<div class="letter"><p>${esc(date)}</p><p>${esc(body.greeting)}</p>${body.paragraphs
      .map((p) => `<p>${esc(p.text)}</p>`)
      .join("")}<p>${esc(body.closing)}<br>${esc(body.name)}</p></div>`,
    options,
  );
}

export function renderDocument(body: DocumentBody, options: RenderOptions = {}): string {
  return body.kind === "resume" ? renderResume(body, options) : renderCoverLetter(body, options);
}
