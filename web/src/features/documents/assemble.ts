import type { CoverLetterOutput } from "@/features/ai/tasks/draft-cover-letter";
import type { TailoredResumeOutput } from "@/features/ai/tasks/tailor-resume";
import type { DocumentHeader } from "@/features/profile/contact";
import type { ProfileItem } from "@/features/profile/profile";
import { type CoverLetterBody, type Line, newId, type ResumeBody } from "./body";

/**
 * Turns model output into a document body, enforcing "no invented facts" in code:
 * a line survives only if every item it cites is one of the member's own items that
 * may appear on this kind of document. Entry titles, employers and dates are copied
 * from the profile, never taken from the model.
 */

export type AssembleReport = { kept: number; dropped: number };

/** Items a document may draw on: never "never include", and cover-letter-only items only on letters. */
export function usableItems(
  items: ProfileItem[],
  kind: "resume" | "cover_letter",
): Map<string, ProfileItem> {
  return new Map(
    items
      .filter(
        (i) =>
          i.visibility !== "never" &&
          (kind === "cover_letter" || i.visibility !== "cover_letter_only"),
      )
      .map((i) => [i.id, i]),
  );
}

/** Profile items as the model reads them: one JSON object per line, with ids. */
export function itemsForPrompt(usable: Map<string, ProfileItem>): string {
  return [...usable.values()]
    .map((i) =>
      JSON.stringify({
        id: i.id,
        type: i.type,
        ...(i.parentId ? { parentId: i.parentId } : {}),
        ...(i.title ? { title: i.title } : {}),
        ...(i.organization ? { organization: i.organization } : {}),
        ...(i.startDate || i.endDate
          ? { dates: [i.startDate, i.endDate].filter(Boolean).join(" – ") }
          : {}),
        ...(i.content ? { content: i.content } : {}),
        ...(i.visibility === "always" ? { mustInclude: true } : {}),
      }),
    )
    .join("\n");
}

function toLine(
  raw: { text: string; sources: string[]; reworded?: boolean },
  usable: Map<string, ProfileItem>,
  report: AssembleReport,
  requireSources: boolean,
): Line | null {
  const sources = [...new Set(raw.sources)];
  const valid = sources.every((id) => usable.has(id));
  if (!valid || (requireSources && sources.length === 0)) {
    report.dropped++;
    return null;
  }
  report.kept++;
  return {
    id: newId(),
    text: raw.text.trim(),
    sources,
    origin: raw.reworded === false && sources.length === 1 ? "profile" : "reworded",
  };
}

const dates = (item: ProfileItem) => [item.startDate, item.endDate].filter(Boolean).join(" – ");
const entryTypes = new Set(["role", "project", "certification"]);

export function assembleResume(
  output: TailoredResumeOutput,
  items: ProfileItem[],
  header: DocumentHeader,
): { body: ResumeBody; report: AssembleReport } {
  const usable = usableItems(items, "resume");
  const report: AssembleReport = { kept: 0, dropped: 0 };
  const lines = (raw: TailoredResumeOutput["summary"]) =>
    raw.map((l) => toLine(l, usable, report, true)).filter((l): l is Line => l !== null);

  const seenEntries = new Set<string>();
  const sections = output.sections
    .map((section) => ({
      id: newId("s"),
      heading: section.heading,
      entries: section.entries.flatMap((entry) => {
        const item = usable.get(entry.itemId);
        if (!item || !entryTypes.has(item.type) || seenEntries.has(item.id)) {
          report.dropped += entry.bullets.length;
          return [];
        }
        seenEntries.add(item.id);
        return [
          {
            id: newId("e"),
            itemId: item.id,
            title: item.title,
            subtitle: item.organization,
            dates: dates(item),
            lines: lines(entry.bullets),
          },
        ];
      }),
    }))
    .filter((s) => s.entries.length > 0);

  return {
    body: {
      kind: "resume",
      name: header.name,
      contact: header.contact,
      links: header.links,
      contactParts: header.parts,
      summary: lines(output.summary),
      sections,
      skills: lines(output.skills),
    },
    report,
  };
}

export function assembleCoverLetter(
  output: CoverLetterOutput,
  items: ProfileItem[],
  header: DocumentHeader,
): { body: CoverLetterBody; report: AssembleReport } {
  const usable = usableItems(items, "cover_letter");
  const report: AssembleReport = { kept: 0, dropped: 0 };
  const paragraphs = output.paragraphs
    // A paragraph about the role alone may cite nothing; one that cites must cite real items.
    .map((p) => toLine({ ...p, reworded: true }, usable, report, false))
    .filter((l): l is Line => l !== null);
  return {
    body: {
      kind: "cover_letter",
      name: header.name,
      contact: header.contact,
      links: header.links,
      contactParts: header.parts,
      greeting: output.greeting,
      paragraphs,
      closing: output.closing,
    },
    report,
  };
}
