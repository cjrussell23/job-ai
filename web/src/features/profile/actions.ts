"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/features/members/session";
import { queue, queues } from "@/lib/queue";
import { extractResumeText } from "./extract-text";
import { createItem, createUpload, deleteItem, itemTypes, moveItem, updateItem } from "./profile";

export type FormState = { error?: string; message?: string };

const maxUploadBytes = 5 * 1024 * 1024;

export async function uploadResumeAction(_: FormState, form: FormData): Promise<FormState> {
  const { userId } = await requireMember();
  const file = form.get("resume");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > maxUploadBytes) return { error: "That file is over 5 MB." };
  const extracted = await extractResumeText({
    name: file.name,
    type: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  if (!extracted.ok) {
    return {
      error:
        extracted.reason === "unsupported_type"
          ? "Upload a PDF, Word (.docx) or text file."
          : "No text could be read from that file. If it is a scanned image, add items by hand.",
    };
  }
  const uploadId = await createUpload(userId, file.name, extracted.text);
  await (await queue()).send(queues.parseResume, { userId, uploadId });
  revalidatePath("/profile");
  return { message: "Uploaded. Reading your resume…" };
}

function fieldsFrom(form: FormData) {
  const text = (name: string) => String(form.get(name) ?? "");
  return {
    title: text("title"),
    organization: text("organization"),
    content: text("content"),
    startDate: text("startDate"),
    endDate: text("endDate"),
    visibility: text("visibility") || "auto",
  };
}

const typeSchema = z.enum(itemTypes);

export async function createItemAction(_: FormState, form: FormData): Promise<FormState> {
  const { userId } = await requireMember();
  const type = typeSchema.safeParse(form.get("type"));
  if (!type.success) return { error: "Unknown item type." };
  const parentId = form.get("parentId");
  const result = await createItem(userId, {
    ...fieldsFrom(form),
    type: type.data,
    parentId: typeof parentId === "string" && parentId ? parentId : null,
  });
  revalidatePath("/profile");
  return result.ok ? { message: "Added." } : { error: "That item could not be added." };
}

export async function updateItemAction(_: FormState, form: FormData): Promise<FormState> {
  const { userId } = await requireMember();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Unknown item." };
  const result = await updateItem(userId, id.data, fieldsFrom(form));
  revalidatePath("/profile");
  return result.ok ? { message: "Saved." } : { error: "That item could not be saved." };
}

export async function deleteItemAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const id = z.uuid().parse(form.get("id"));
  await deleteItem(userId, id);
  revalidatePath("/profile");
}

export async function moveItemAction(form: FormData): Promise<void> {
  const { userId } = await requireMember();
  const id = z.uuid().parse(form.get("id"));
  const direction = z.enum(["up", "down"]).parse(form.get("direction"));
  await moveItem(userId, id, direction);
  revalidatePath("/profile");
}
