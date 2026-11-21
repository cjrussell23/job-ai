import type { CoverLetterBody, DocumentBody, ResumeBody } from "./body";

/** The "clean" template: one page, system fonts, print-ready. */

const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const styles = `
  @page { size: Letter; margin: 0.6in 0.7in; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 10.5pt; line-height: 1.4; color: #111; margin: 0; }
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

function page(title: string, content: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${styles}</style></head><body>${content}</body></html>`;
}

function header(body: { name: string; contact: string }): string {
  return `<header><h1>${esc(body.name)}</h1><div class="contact">${esc(body.contact)}</div></header>`;
}

export function renderResume(body: ResumeBody): string {
  const summary = body.summary.length
    ? `<p>${body.summary.map((l) => esc(l.text)).join(" ")}</p>`
    : "";
  const sections = body.sections
    .map(
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
    )
    .join("");
  const skills = body.skills.length
    ? `<h2>Skills</h2><p>${body.skills.map((l) => esc(l.text)).join(" · ")}</p>`
    : "";
  return page(`${body.name} resume`, `${header(body)}${summary}${sections}${skills}`);
}

export function renderCoverLetter(body: CoverLetterBody): string {
  const date = new Date().toLocaleDateString("en-CA", {
    dateStyle: "long",
    timeZone: "America/Edmonton",
  });
  return page(
    `${body.name} cover letter`,
    `${header(body)}<div class="letter"><p>${esc(date)}</p><p>${esc(body.greeting)}</p>${body.paragraphs
      .map((p) => `<p>${esc(p.text)}</p>`)
      .join("")}<p>${esc(body.closing)}<br>${esc(body.name)}</p></div>`,
  );
}

export function renderDocument(body: DocumentBody): string {
  return body.kind === "resume" ? renderResume(body) : renderCoverLetter(body);
}
