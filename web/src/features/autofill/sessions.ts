import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { type ApplySession, applySessions, type Document, type FormQuestion } from "@/db/schema";
import { runTask } from "@/features/ai/run-task";
import { answerApplicationQuestions } from "@/features/ai/tasks/answer-application-questions";
import {
  getApplication,
  markAssisted,
  setStatus,
  trackJob,
} from "@/features/applications/applications";
import { getDocument } from "@/features/documents/documents";
import { coverLetterParagraphs, documentFileName } from "@/features/documents/files";
import { jobForPrompt, jobsWithPostings } from "@/features/jobs/jobs";
import { memberHeader } from "@/features/members/members";
import { getContact } from "@/features/profile/contact";
import { listItems } from "@/features/profile/profile";
import { recordedNos } from "@/features/profile/questions";
import { log } from "@/lib/log";
import { queue, queues } from "@/lib/queue";
import { getStandardAnswers, listSavedAnswers, saveAnswers } from "./answers";
import { applyUrlFor, type Packet, sortLinks, splitLocation, splitName } from "./packet";

export type { ApplySession };

/** How long a ticket opens its packet: long enough to sign in and work through a form. */
const ticketLifetimeMs = 2 * 60 * 60 * 1000;
const ticketPattern = /^[A-Za-z0-9_-]{43}$/;
const hashTicket = (ticket: string) => createHash("sha256").update(ticket).digest("hex");

export type StartResult =
  | { ok: true; ticket: string; applyUrl: string }
  | { ok: false; reason: "not_found" | "no_link" };

/**
 * Starts autofill for a job: tracks it if it isn't on the board yet, marks the
 * application as assisted and hands back a fresh ticket and the form's address.
 */
export async function startApplySession(
  userId: string,
  jobId: string,
  targetId: string | null,
): Promise<StartResult> {
  const [job] = await jobsWithPostings([jobId]);
  if (!job) return { ok: false, reason: "not_found" };
  const applyUrl = applyUrlFor(job.postings.map((p) => p.url));
  if (!applyUrl) return { ok: false, reason: "no_link" };
  const application = await trackJob(userId, jobId, "saved", targetId);
  await markAssisted(userId, application.id);
  const ticket = randomBytes(32).toString("base64url");
  await db()
    .insert(applySessions)
    .values({
      userId,
      applicationId: application.id,
      ticketHash: hashTicket(ticket),
      expiresAt: new Date(Date.now() + ticketLifetimeMs),
    });
  log.info({ applicationId: application.id }, "apply session started");
  return { ok: true, ticket, applyUrl };
}

/**
 * The live apply session a ticket opens, if any. Like a public resume token (ADR 0004),
 * this is a lookup on user-owned data that doesn't filter by user: the ticket is the
 * permission, and it only ever matches the session its member started.
 */
export async function sessionForTicket(ticket: string): Promise<ApplySession | undefined> {
  if (!ticketPattern.test(ticket)) return undefined;
  const [row] = await db()
    .select()
    .from(applySessions)
    .where(
      and(
        eq(applySessions.ticketHash, hashTicket(ticket)),
        gt(applySessions.expiresAt, sql`now()`),
      ),
    );
  return row;
}

/** An approved document on the session's application, or null (rule 6). */
export async function sessionDocument(
  session: ApplySession,
  kind: "resume" | "cover_letter",
): Promise<Document | null> {
  const application = await getApplication(session.userId, session.applicationId);
  const id = kind === "resume" ? application?.resumeId : application?.coverLetterId;
  if (!id) return null;
  const doc = await getDocument(session.userId, id);
  return doc && doc.kind === kind && doc.state === "approved" ? doc : null;
}

export async function packetFor(session: ApplySession): Promise<Packet | null> {
  const { userId } = session;
  const application = await getApplication(userId, session.applicationId);
  if (!application) return null;
  const [[job], contact, account, items, standard, saved, resume, letter] = await Promise.all([
    jobsWithPostings([application.jobId]),
    getContact(userId),
    memberHeader(userId),
    listItems(userId),
    getStandardAnswers(userId),
    listSavedAnswers(userId),
    sessionDocument(session, "resume"),
    sessionDocument(session, "cover_letter"),
  ]);
  if (!job) return null;
  const fullName = contact?.fullName || account.name;
  const location = contact?.location ?? "";
  const current = items.find(
    (i) => i.type === "role" && i.visibility !== "never" && /present|current|now/i.test(i.endDate),
  );
  const letterText = letter ? coverLetterParagraphs(letter) : null;
  return {
    sessionId: session.id,
    expiresAt: session.expiresAt.toISOString(),
    job: {
      title: job.title,
      company: job.company,
      applyUrl: applyUrlFor(job.postings.map((p) => p.url)) ?? "",
    },
    contact: {
      fullName,
      ...splitName(fullName),
      email: contact?.email || account.email,
      phone: contact?.phone ?? "",
      location,
      ...splitLocation(location),
      ...sortLinks(contact?.links ?? []),
    },
    currentRole: current ? { title: current.title, company: current.organization } : null,
    standard,
    saved: saved.map((s) => ({ key: s.questionKey, question: s.question, answer: s.answer })),
    documents: {
      resume: resume ? { fileName: documentFileName(resume, "pdf") } : null,
      coverLetter:
        letter && letterText !== null
          ? { fileName: documentFileName(letter, "pdf"), text: letterText }
          : null,
    },
  };
}

export const formQuestionsSchema = z
  .array(
    z.object({
      key: z.string().min(1).max(200),
      label: z.string().trim().min(1).max(500),
      kind: z.enum(["text", "textarea", "select", "radio", "checkbox"]),
      options: z.array(z.string().max(300)).max(80).default([]),
      required: z.boolean().default(false),
    }),
  )
  .min(1)
  .max(40);

/** Asks the model to answer the questions the extension couldn't fill from the packet. */
export async function requestAnswers(session: ApplySession, questions: FormQuestion[]) {
  await db()
    .update(applySessions)
    .set({ questions, answers: [], answersState: "working" })
    .where(and(eq(applySessions.id, session.id), eq(applySessions.userId, session.userId)));
  await (await queue()).send(queues.answerApplicationQuestions, {
    userId: session.userId,
    sessionId: session.id,
  });
}

async function getSession(userId: string, id: string): Promise<ApplySession | undefined> {
  const [row] = await db()
    .select()
    .from(applySessions)
    .where(and(eq(applySessions.id, id), eq(applySessions.userId, userId)));
  return row;
}

/** Pure: keeps only answers to questions that were asked, with options matched exactly. */
export function cleanAnswers(
  questions: FormQuestion[],
  answers: { key: string; answer: string | null; sourceIds: string[] }[],
  knownIds: Set<string>,
) {
  return questions.map((q) => {
    const drafted = answers.find((a) => a.key === q.key);
    let answer = drafted?.answer?.trim() || null;
    if (answer && (q.kind === "select" || q.kind === "radio")) {
      answer = q.options.find((o) => o.trim().toLowerCase() === answer?.toLowerCase()) ?? null;
    }
    if (answer && q.kind === "checkbox" && !/^(yes|no)$/i.test(answer)) answer = null;
    return {
      key: q.key,
      answer,
      sourceIds: (drafted?.sourceIds ?? []).filter((id) => knownIds.has(id)),
    };
  });
}

/** Worker job: answers a session's questions from the profile only (rule 1). */
export async function runAnswers(userId: string, sessionId: string): Promise<void> {
  const session = await getSession(userId, sessionId);
  if (!session || session.answersState !== "working") return;
  const application = await getApplication(userId, session.applicationId);
  if (!application) return;
  const [items, noes, standard, [job], letter] = await Promise.all([
    listItems(userId),
    recordedNos(userId),
    getStandardAnswers(userId),
    jobsWithPostings([application.jobId]),
    sessionDocument(session, "cover_letter"),
  ]);
  const usable = items.filter((i) => i.visibility !== "never");
  const profile = usable
    .map((i) =>
      JSON.stringify({
        id: i.id,
        type: i.type,
        ...(i.parentId ? { parentId: i.parentId } : {}),
        ...(i.title ? { title: i.title } : {}),
        ...(i.organization ? { organization: i.organization } : {}),
        ...(i.startDate || i.endDate ? { dates: `${i.startDate} to ${i.endDate}` } : {}),
        ...(i.content ? { content: i.content } : {}),
      }),
    )
    .join("\n");
  const result = await runTask(userId, answerApplicationQuestions, {
    profile,
    doNotClaim: noes,
    standardAnswers: JSON.stringify(standard),
    coverLetter: letter ? coverLetterParagraphs(letter) : null,
    job: job ? jobForPrompt(job, 4000) : "(unknown)",
    questions: session.questions,
  });
  const answers = result.ok
    ? cleanAnswers(session.questions, result.output.answers, new Set(usable.map((i) => i.id)))
    : [];
  await db()
    .update(applySessions)
    .set({ answers, answersState: result.ok ? "ready" : "failed" })
    .where(and(eq(applySessions.id, session.id), eq(applySessions.userId, userId)));
  log.info(
    {
      sessionId,
      asked: session.questions.length,
      answered: answers.filter((a) => a.answer).length,
    },
    result.ok ? "application questions answered" : "answering application questions failed",
  );
}

export const finishSchema = z.object({
  submitted: z.boolean(),
  filledCount: z.int().min(0).max(500).default(0),
  save: z
    .array(z.object({ question: z.string().max(500), answer: z.string().max(3000) }))
    .max(60)
    .default([]),
});

/**
 * The member is done with the form: keeps the answers they chose to remember and, when
 * they say they submitted it, marks the application applied.
 */
export async function finishSession(
  session: ApplySession,
  input: z.infer<typeof finishSchema>,
): Promise<{ saved: number }> {
  const saved = await saveAnswers(session.userId, input.save);
  await db()
    .update(applySessions)
    .set({
      filledCount: input.filledCount,
      ...(input.submitted ? { submittedAt: new Date() } : {}),
    })
    .where(and(eq(applySessions.id, session.id), eq(applySessions.userId, session.userId)));
  if (input.submitted) await setStatus(session.userId, session.applicationId, "applied");
  return { saved };
}
