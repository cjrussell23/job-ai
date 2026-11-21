import type { CoverLetterBody, DocumentBody, ResumeBody } from "./body";
import { type Density, defaultLayout, densityStyles, type Layout } from "./layout";

/** The "clean" template: system fonts, print-ready, sized by the layout's density. */

const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const styles = (density: Density, preview: boolean) => {
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
`;
};

export type RenderOptions = { layout?: Layout; preview?: boolean };

function page(title: string, content: string, options: RenderOptions): string {
  const layout = options.layout ?? defaultLayout;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${styles(layout.density, options.preview ?? false)}</style></head><body>${content}</body></html>`;
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

export function renderResume(body: ResumeBody, options: RenderOptions = {}): string {
  const summary = body.summary.length
    ? `<p>${body.summary.map((l) => esc(l.text)).join(" ")}</p>`
    : "";
  const sectionHtml = body.sections.map(
    (section) =>
      `<h2>${esc(section.heading)}</h2>${section.entries
        .map(
          (entry) =>
            `<div class="entry"><div class="entry-head"><div><span class="entry-title">${esc(entry.title)}</span>${
              entry.subtitle ? ` <span class="entry-sub">· ${esc(entry.subtitle)}</span>` : ""
            }</div><div class="dates">${esc(entry.dates)}</div></div>${
              entry.lines.length
                ? `<ul>${entry.lines.map((l) => `<li>${esc(l.text)}</li>`).join("")}</ul>`
                : ""
            }</div>`,
        )
        .join("")}`,
  );
  const skills = body.skills.length
    ? `<h2>Skills</h2><p>${body.skills.map((l) => esc(l.text)).join(" · ")}</p>`
    : "";
  const at = Math.min(body.skillsAt ?? sectionHtml.length, sectionHtml.length);
  const blocks = [...sectionHtml.slice(0, at), skills, ...sectionHtml.slice(at)].join("");
  return page(`${body.name} resume`, `${header(body)}${summary}${blocks}`, options);
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
