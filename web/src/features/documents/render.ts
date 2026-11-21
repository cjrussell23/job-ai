import type { CoverLetterBody, DocumentBody, ResumeBody, ResumeEntry } from "./body";
import { type Density, defaultLayout, densityStyles, type Layout, type Template } from "./layout";

/**
 * Two print-ready templates, "clean" (sans-serif) and "classic" (serif, centred header),
 * sized by the layout's density. Single column with standard headings, so applicant
 * tracking systems read them in order.
 */

const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const classic = `
  body { font-family: Georgia, "Times New Roman", serif; }
  header { text-align: center; border-bottom: none; }
  h1 { font-size: 20pt; letter-spacing: 0.04em; }
  h2 { border-bottom: 1px solid #999; padding-bottom: 2pt; color: #111; letter-spacing: 0.12em; }
`;

const styles = (density: Density, template: Template, preview: boolean) => {
  const d = densityStyles[density];
  const margin = `${d.marginIn.y}in ${d.marginIn.x}in`;
  return `
  @page { size: Letter; margin: ${margin}; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; font-size: ${d.fontPt}pt; line-height: ${d.lineHeight}; color: #111; margin: 0; }
  ${preview ? `html { background: #fff; } body { width: 8.5in; padding: ${margin}; }` : ""}
  a { color: inherit; text-decoration: none; }
  header { border-bottom: 1px solid #ccc; padding-bottom: 6pt; margin-bottom: 10pt; }
  h1 { font-size: 18pt; margin: 0; letter-spacing: 0.02em; }
  .contact { color: #555; font-size: 9.5pt; margin-top: 2pt; }
  h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.08em; color: #333; margin: 12pt 0 4pt; }
  .entry { margin-bottom: 7pt; break-inside: avoid; }
  .entry-head { display: flex; justify-content: space-between; gap: 12pt; }
  .entry-title { font-weight: 600; }
  .entry-sub { color: #444; }
  .dates { color: #555; white-space: nowrap; font-size: 9.5pt; }
  ul { margin: 2pt 0 0; padding-left: 14pt; }
  li { margin: 1pt 0; }
  p { margin: 0 0 9pt; }
  .letter p { margin-bottom: 11pt; }
  .group { margin-bottom: 7pt; }
  .group > .entry-head { margin-bottom: 2pt; }
  .group .entry { margin: 0 0 5pt; }
  .group .entry-title { font-weight: 500; font-style: italic; }
  .entry-link { color: #444; font-size: 9.5pt; }
  ${template === "classic" ? classic : ""}
`;
};

export type RenderOptions = { layout?: Layout; preview?: boolean };

function page(title: string, content: string, options: RenderOptions): string {
  const layout = options.layout ?? defaultLayout;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${styles(layout.density, layout.template, options.preview ?? false)}</style></head><body>${content}</body></html>`;
}

const linkText = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

function header(body: {
  name: string;
  contact: string;
  links: { label: string; url: string }[];
}): string {
  const links = body.links
    // Only web links are printed as links; anything else is left out rather than trusted.
    .filter((l) => /^https?:\/\//i.test(l.url))
    .map((l) => `<a href="${esc(l.url)}">${esc(linkText(l.url))}</a>`);
  const parts = [...(body.contact ? [esc(body.contact)] : []), ...links];
  return `<header><h1>${esc(body.name)}</h1><div class="contact">${parts.join(" · ")}</div></header>`;
}

const isWeb = (url: string | undefined): url is string => !!url && /^https?:\/\//i.test(url);

function entryHtml(entry: ResumeEntry, inGroup: boolean): string {
  const link = isWeb(entry.url)
    ? ` <a class="entry-link" href="${esc(entry.url)}">${esc(linkText(entry.url))}</a>`
    : "";
  const sub =
    !inGroup && entry.subtitle ? ` <span class="entry-sub">· ${esc(entry.subtitle)}</span>` : "";
  const lines = entry.lines.length
    ? `<ul>${entry.lines.map((l) => `<li>${esc(l.text)}</li>`).join("")}</ul>`
    : "";
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
function spanOf(group: ResumeEntry[]): string {
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
        if (group.length === 1 && only) return entryHtml(only, false);
        return `<div class="group"><div class="entry-head"><div><span class="entry-title" style="font-style:normal;font-weight:600">${esc(group[0]?.subtitle ?? "")}</span></div><div class="dates">${esc(spanOf(group))}</div></div>${group.map((e) => entryHtml(e, true)).join("")}</div>`;
      })
      .join("");
    return `<h2>${esc(section.heading)}</h2>${html}`;
  });
  const skills = body.skills.length
    ? `<h2>${esc(body.skillsHeading || "Skills")}</h2><p>${body.skills.map((l) => esc(l.text)).join(" · ")}</p>`
    : "";
  const at = Math.min(body.skillsAt ?? sectionHtml.length, sectionHtml.length);
  const blocks = [...sectionHtml.slice(0, at), skills, ...sectionHtml.slice(at)].join("");
  return page(`${body.name} resume`, `${header(body)}${summary}${blocks}`, options);
}

/** The resume as plain text, for pasting into an employer's application form. */
export function renderResumeText(body: ResumeBody): string {
  const out: string[] = [
    body.name,
    [body.contact, ...body.links.map((l) => l.url)].filter(Boolean).join(" | "),
    "",
  ];
  if (body.summary.length) out.push(body.summary.map((l) => l.text).join(" "), "");
  const sections = body.sections.map((section) => {
    const lines = [section.heading.toUpperCase()];
    for (const entry of section.entries) {
      const head = [entry.title, entry.subtitle].filter(Boolean).join(", ");
      lines.push(
        [head, entry.dates].filter(Boolean).join(" | ") + (entry.url ? ` | ${entry.url}` : ""),
      );
      for (const line of entry.lines) lines.push(`- ${line.text}`);
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
    `${header(body)}<div class="letter"><p>${esc(date)}</p><p>${esc(body.greeting)}</p>${body.paragraphs
      .map((p) => `<p>${esc(p.text)}</p>`)
      .join("")}<p>${esc(body.closing)}<br>${esc(body.name)}</p></div>`,
    options,
  );
}

export function renderDocument(body: DocumentBody, options: RenderOptions = {}): string {
  return body.kind === "resume" ? renderResume(body, options) : renderCoverLetter(body, options);
}
