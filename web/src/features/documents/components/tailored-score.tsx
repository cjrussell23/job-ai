import "server-only";
import { resumeBodySchema } from "@/features/documents/body";
import type { Document } from "@/features/documents/documents";
import { readLayout } from "@/features/documents/layout";
import { documentPdf, pdfPageCount } from "@/features/documents/pdf";
import { scoreBody } from "@/features/documents/score";
import { tailoredLayout } from "@/features/documents/standing";
import { ScoreCard } from "./score-card";

// Page counts need a real PDF render, so each version is counted once per server process.
const pageCache = new Map<string, number>();

async function pagesFor(doc: Document): Promise<number | null> {
  const key = `${doc.id}:${doc.version}:${doc.updatedAt.getTime()}`;
  const cached = pageCache.get(key);
  if (cached !== undefined) return cached;
  const body = resumeBodySchema.safeParse(doc.body);
  if (!body.success) return null;
  const pages = pdfPageCount(await documentPdf(body.data, readLayout(doc.layout)));
  if (pageCache.size > 200) pageCache.clear();
  pageCache.set(key, pages);
  return pages;
}

/** Page count and score for a tailored resume, shown under its editor. */
export async function TailoredScore({ doc }: { doc: Document }) {
  const body = resumeBodySchema.safeParse(doc.body);
  if (!body.success) return null;
  // Resumes drafted before tailored layouts existed have none: judge them by the
  // member's standing resume target, as a redraft would use.
  const target = doc.layout
    ? readLayout(doc.layout).pages
    : (await tailoredLayout(doc.userId)).pages;
  const pages = await pagesFor(doc).catch(() => null);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {pages === null
          ? "Page count unavailable."
          : `The PDF is ${pages} page${pages === 1 ? "" : "s"}.`}
      </p>
      <ScoreCard score={scoreBody(body.data, pages ?? 1, target)} />
    </div>
  );
}
