import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { documents } from "@/db/schema";
import { type ResumeBody, resumeBodySchema } from "./body";
import { type Layout, readLayout } from "./layout";

/**
 * Public links to standing resumes (ADR 0004). A member opts in per resume; the link is an
 * unguessable token, so a portfolio site can read the resume without signing in, and the
 * member can revoke it at any time.
 */

/** 32 bytes of randomness, URL-safe. */
const newToken = () => randomBytes(32).toString("base64url");
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

const standingResume = (userId: string, id: string) =>
  and(
    eq(documents.id, id),
    eq(documents.userId, userId),
    eq(documents.standing, true),
    eq(documents.kind, "resume"),
  );

/** Shares a standing resume, keeping its existing link if it already has one. */
export async function shareStandingResume(userId: string, id: string): Promise<string | null> {
  await db()
    .update(documents)
    .set({ publicToken: newToken() })
    .where(and(standingResume(userId, id), isNull(documents.publicToken)));
  const [doc] = await db()
    .select({ token: documents.publicToken })
    .from(documents)
    .where(standingResume(userId, id));
  return doc?.token ?? null;
}

/** Stops sharing: the old link stops working and is never reused. */
export async function unshareStandingResume(userId: string, id: string): Promise<boolean> {
  const updated = await db()
    .update(documents)
    .set({ publicToken: null })
    .where(standingResume(userId, id))
    .returning({ id: documents.id });
  return updated.length > 0;
}

export type SharedResume = {
  id: string;
  body: ResumeBody;
  layout: Layout;
  updatedAt: Date;
};

/**
 * The one lookup that does not filter by user: the token itself is the permission, and it
 * only ever matches a standing resume its owner chose to share.
 */
export async function sharedResume(token: string): Promise<SharedResume | null> {
  if (!tokenPattern.test(token)) return null;
  const [doc] = await db()
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.publicToken, token),
        eq(documents.standing, true),
        eq(documents.kind, "resume"),
        eq(documents.state, "approved"),
      ),
    );
  const body = resumeBodySchema.safeParse(doc?.body);
  if (!doc || !body.success) return null;
  return { id: doc.id, body: body.data, layout: readLayout(doc.layout), updatedAt: doc.updatedAt };
}

/**
 * What the public JSON shows: the resume's own text, with no profile item ids or line
 * sources, which are the app's bookkeeping rather than part of the resume.
 */
export function publicResumeJson(shared: SharedResume, pdfUrl: string) {
  const { body, layout } = shared;
  return {
    name: body.name,
    contact: body.contactParts ?? [],
    links: body.links,
    summary: body.summary.map((l) => l.text).join(" "),
    sections: body.sections.map((section) => ({
      heading: section.heading,
      key: section.key ?? null,
      // Titles at one employer print under one heading when the resume groups them.
      groupByEmployer: Boolean(section.groupable && layout.groupRoles),
      entries: section.entries.map((entry) => ({
        title: entry.title,
        subtitle: entry.subtitle,
        dates: entry.dates,
        url: entry.url ?? null,
        lines: entry.lines.map((l) => l.text),
      })),
    })),
    skillsHeading: body.skillsHeading || "Skills",
    skills: body.skills.map((l) => l.text),
    updatedAt: shared.updatedAt.toISOString(),
    pdfUrl,
  };
}

export type PublicResume = ReturnType<typeof publicResumeJson>;
