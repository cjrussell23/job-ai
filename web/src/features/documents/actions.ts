"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/features/members/session";
import { createItem } from "@/features/profile/profile";
import { queue, queues } from "@/lib/queue";
import { documentBodySchema } from "./body";
import { approveDocument, getDocument, saveEdits, startDocument } from "./documents";

export type FormState = { error?: string; message?: string };

const kinds = z.enum(["resume", "cover_letter"]);

/** Starts drafting (or redrafting) one or both tailored documents for a job. */
export async function draftAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const jobId = z.uuid().parse(form.get("jobId"));
  const which = form.get("kind");
  const wanted = which ? [kinds.parse(which)] : (["resume", "cover_letter"] as const);
  const boss = await queue();
  for (const kind of wanted) {
    const documentId = await startDocument(userId, jobId, kind);
    await boss.send(queues.draftDocument, { userId, documentId, jobId, kind });
  }
  revalidatePath(`/jobs/${jobId}`);
}

export async function saveEditsAction(documentId: string, body: unknown): Promise<FormState> {
  const { userId } = await requireMember();
  const result = await saveEdits(userId, z.uuid().parse(documentId), body);
  const doc = await getDocument(userId, documentId);
  if (doc?.jobId) revalidatePath(`/jobs/${doc.jobId}`);
  if (result.ok) return { message: "Saved as a draft." };
  return {
    error:
      result.reason === "busy"
        ? "This document is still being written."
        : "Those changes could not be saved.",
  };
}

export async function approveAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const documentId = z.uuid().parse(form.get("documentId"));
  await approveDocument(userId, documentId);
  const doc = await getDocument(userId, documentId);
  if (doc?.jobId) revalidatePath(`/jobs/${doc.jobId}`);
}

/**
 * A line the member typed is not in their profile; this saves it there, as a bullet
 * under the role it sits in on the resume, or as a note.
 */
export async function saveLineToProfileAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const documentId = z.uuid().parse(form.get("documentId"));
  const lineId = z.string().min(1).parse(form.get("lineId"));
  const doc = await getDocument(userId, documentId);
  const body = documentBodySchema.safeParse(doc?.body);
  if (!doc || !body.success) return;
  if (body.data.kind === "resume") {
    for (const entry of body.data.sections.flatMap((s) => s.entries)) {
      const line = entry.lines.find((l) => l.id === lineId && l.origin === "user_written");
      if (line && entry.itemId) {
        await createItem(userId, { type: "bullet", parentId: entry.itemId, content: line.text });
        break;
      }
    }
  } else {
    const line = body.data.paragraphs.find((l) => l.id === lineId && l.origin === "user_written");
    if (line) await createItem(userId, { type: "note", content: line.text });
  }
  revalidatePath("/profile");
  if (doc.jobId) revalidatePath(`/jobs/${doc.jobId}`);
}
