/**
 * Where pages break, from the unbroken layout of a resume, following the same rules as
 * the print styles: never inside a bullet or line, never straight after a heading, and
 * always before a section marked to start a new page. Used by the live preview.
 */

export type Atom = {
  /** Offset from the top of the content, in pixels. */
  top: number;
  bottom: number;
  /** A heading that must stay on the same page as what follows it. */
  keepWithNext: boolean;
  /** Starts a new page. */
  breakBefore: boolean;
};

export type Pagination = {
  /** Content offsets where each new page starts. */
  breaks: number[];
  pages: number;
  /** Height of content past the end of page `target`, for "drop these" suggestions. */
  overflowPast: (target: number) => number;
};

export function paginate(atoms: Atom[], pageHeight: number): Pagination {
  const breaks: number[] = [];
  let pageStart = 0;
  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    if (!atom) continue;
    const startsPage = atom.top <= pageStart + 0.5;
    if (atom.breakBefore && !startsPage) {
      breaks.push(atom.top);
      pageStart = atom.top;
      continue;
    }
    if (atom.bottom - pageStart <= pageHeight) continue;
    // Pull any headings just above this atom onto the new page with it.
    let first = i;
    while (
      first > 0 &&
      atoms[first - 1]?.keepWithNext &&
      (atoms[first - 1]?.top ?? 0) > pageStart
    ) {
      first--;
    }
    // The headings start this page already, so breaking would strand them: let it overflow.
    const before = atoms[first - 1];
    if (before?.keepWithNext && before.top <= pageStart + 0.5) continue;
    const at = atoms[first]?.top ?? atom.top;
    // An atom taller than a page still has to start somewhere; never break at the page start.
    if (at <= pageStart + 0.5) continue;
    breaks.push(at);
    pageStart = at;
  }
  const end = atoms.at(-1)?.bottom ?? 0;
  return {
    breaks,
    pages: breaks.length + 1,
    overflowPast: (target) => {
      const startOfNext = breaks[target - 1];
      return startOfNext === undefined ? 0 : end - startOfNext;
    },
  };
}
