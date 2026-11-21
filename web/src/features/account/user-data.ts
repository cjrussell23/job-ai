import { count, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiUsage,
  applicationEvents,
  applications,
  documents,
  feedback,
  jobMatches,
  jobTargets,
  learnedPreferences,
  matchSummaries,
  memberJobPay,
  members,
  profileContacts,
  profileItems,
  profileQuestions,
  resumeUploads,
  suggestions,
  user,
} from "@/db/schema";

/**
 * Every table holding a user's data, and what happens to it on export.
 * Deletion relies on each table's user foreign key cascading from `user`;
 * a test checks this list and those keys against the live schema, so a new
 * user-owned table cannot be forgotten.
 */
export const userOwnedTables = {
  user: "exported",
  members: "exported",
  profile_items: "exported",
  profile_contacts: "exported",
  resume_uploads: "exported",
  job_targets: "exported",
  ai_usage: "exported",
  job_matches: "exported",
  feedback: "exported",
  learned_preferences: "exported",
  documents: "exported",
  applications: "exported",
  member_job_pay: "exported",
  match_summaries: "exported",
  suggestions: "exported",
  profile_questions: "exported",
  profile_reviews: "excluded: a log of review requests",
  rescore_requests: "excluded: a log of rescore button use, kept for the daily limit",
  // A log of shared-job edits; the split itself stays, the log row goes with the member.
  job_splits: "excluded: log of edits to shared jobs",
  // Sign-in records hold tokens; they are never exported.
  session: "excluded: sign-in tokens",
  account: "excluded: Google OAuth tokens",
} as const;

/** Everything the member owns, as one JSON-ready object. Tokens are left out. */
export async function exportUserData(userId: string) {
  const [account] = await db()
    .select({ name: user.name, email: user.email, createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, userId));
  const [member] = await db()
    .select({
      role: members.role,
      scoreThreshold: members.scoreThreshold,
      summariesOn: members.summariesOn,
      summaryScore: members.summaryScore,
      targetFitWeight: members.targetFitWeight,
      spendCapCents: members.spendCapCents,
      invitedAt: members.invitedAt,
      firstSignInAt: members.firstSignInAt,
    })
    .from(members)
    .where(eq(members.userId, userId));
  const [
    items,
    uploads,
    targets,
    usage,
    matches,
    grades,
    preferences,
    docs,
    apps,
    ideas,
    questions,
    contacts,
    knownPay,
    summaryRows,
  ] = await Promise.all([
    db().select().from(profileItems).where(eq(profileItems.userId, userId)),
    db().select().from(resumeUploads).where(eq(resumeUploads.userId, userId)),
    db().select().from(jobTargets).where(eq(jobTargets.userId, userId)),
    db().select().from(aiUsage).where(eq(aiUsage.userId, userId)),
    db().select().from(jobMatches).where(eq(jobMatches.userId, userId)),
    db().select().from(feedback).where(eq(feedback.userId, userId)),
    db().select().from(learnedPreferences).where(eq(learnedPreferences.userId, userId)),
    db().select().from(documents).where(eq(documents.userId, userId)),
    db().select().from(applications).where(eq(applications.userId, userId)),
    db().select().from(suggestions).where(eq(suggestions.userId, userId)),
    db().select().from(profileQuestions).where(eq(profileQuestions.userId, userId)),
    db().select().from(profileContacts).where(eq(profileContacts.userId, userId)),
    db().select().from(memberJobPay).where(eq(memberJobPay.userId, userId)),
    db().select().from(matchSummaries).where(eq(matchSummaries.userId, userId)),
  ]);
  const history = apps.length
    ? await db()
        .select()
        .from(applicationEvents)
        .where(
          inArray(
            applicationEvents.applicationId,
            apps.map((a) => a.id),
          ),
        )
    : [];
  const strip = <T extends { userId: string | null }>(rows: T[]) =>
    rows.map(({ userId: _, ...rest }) => rest);
  return {
    exportedAt: new Date().toISOString(),
    account: { ...account, ...member },
    contact: strip(contacts)[0] ?? null,
    profileItems: strip(items),
    resumeUploads: strip(uploads),
    jobTargets: strip(targets),
    aiUsage: strip(usage),
    jobMatches: strip(matches),
    feedback: strip(grades),
    learnedPreferences: strip(preferences),
    documents: strip(docs),
    applications: strip(apps).map((a) => ({
      ...a,
      history: history.filter((h) => h.applicationId === a.id),
    })),
    suggestions: strip(ideas),
    profileQuestions: strip(questions),
    jobPay: strip(knownPay),
    matchSummaries: strip(summaryRows),
  };
}

export type DeleteResult = { ok: true } | { ok: false; reason: "only_admin" | "not_found" };

/** Deletes the member and, through cascading keys, everything they own. Shared data stays. */
export async function deleteUserData(userId: string): Promise<DeleteResult> {
  return db().transaction(async (tx) => {
    const [member] = await tx.select().from(members).where(eq(members.userId, userId));
    if (!member) return { ok: false, reason: "not_found" };
    if (member.role === "admin") {
      const [admins] = await tx
        .select({ n: count() })
        .from(members)
        .where(eq(members.role, "admin"));
      if ((admins?.n ?? 0) <= 1) return { ok: false, reason: "only_admin" };
    }
    await tx.delete(members).where(eq(members.userId, userId));
    await tx.delete(user).where(eq(user.id, userId));
    return { ok: true };
  });
}
