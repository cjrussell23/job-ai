import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { type WatchedCompany, watchedCompanies } from "@/db/schema";
import { type BoardSystem, boardFeedUrl, parseBoardUrl } from "./company-boards";
import { type Fetcher, httpFetcher } from "./http";

export type { WatchedCompany };

export async function listWatchedCompanies(): Promise<WatchedCompany[]> {
  return db().select().from(watchedCompanies).orderBy(asc(watchedCompanies.name));
}

export type AddCompanyResult =
  | { ok: true; company: WatchedCompany }
  | { ok: false; reason: "not_a_board" | "board_not_found" | "already_watched" };

/** "acme-labs" -> "Acme Labs", when the board gives no company name. */
const nameFromBoardId = (boardId: string) =>
  boardId
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

async function boardName(
  system: BoardSystem,
  boardId: string,
  fetcher: Fetcher,
): Promise<string | null> {
  try {
    const data = await fetcher.json(boardFeedUrl[system](boardId));
    if (system === "greenhouse") {
      const jobs = (data as { jobs?: { company_name?: string }[] }).jobs;
      return jobs?.[0]?.company_name ?? nameFromBoardId(boardId);
    }
    return nameFromBoardId(boardId);
  } catch {
    return null;
  }
}

/** Adds a company from a link to its job board, after checking the board exists. */
export async function addWatchedCompany(
  url: string,
  options: {
    addedByUserId?: string;
    origin?: "member" | "discovered";
    name?: string;
    fetcher?: Fetcher;
  } = {},
): Promise<AddCompanyResult> {
  const board = parseBoardUrl(url);
  if (!board) return { ok: false, reason: "not_a_board" };
  const [existing] = await db()
    .select()
    .from(watchedCompanies)
    .where(eq(watchedCompanies.boardId, board.boardId));
  if (existing && existing.system === board.system) return { ok: false, reason: "already_watched" };
  const found = await boardName(board.system, board.boardId, options.fetcher ?? httpFetcher);
  if (found === null) return { ok: false, reason: "board_not_found" };
  const [company] = await db()
    .insert(watchedCompanies)
    .values({
      name: options.name?.trim() || found,
      system: board.system,
      boardId: board.boardId,
      origin: options.origin ?? "member",
      addedByUserId: options.addedByUserId ?? null,
    })
    .onConflictDoNothing()
    .returning();
  return company ? { ok: true, company } : { ok: false, reason: "already_watched" };
}

/** Watches every company board linked from a run's postings. Returns how many were new. */
export async function addDiscoveredCompanies(links: string[], fetcher?: Fetcher): Promise<number> {
  const seen = new Set<string>();
  let added = 0;
  for (const link of links) {
    const board = parseBoardUrl(link);
    if (!board) continue;
    const key = `${board.system}:${board.boardId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const result = await addWatchedCompany(link, { origin: "discovered", fetcher });
    if (result.ok) added++;
  }
  return added;
}

export async function removeWatchedCompany(id: string): Promise<boolean> {
  const removed = await db()
    .delete(watchedCompanies)
    .where(eq(watchedCompanies.id, id))
    .returning();
  return removed.length > 0;
}
