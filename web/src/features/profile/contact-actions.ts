"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/features/members/session";
import { saveContact } from "./contact";

export type ContactFormState = { error?: string; message?: string };

const fieldNames: Record<string, string> = {
  fullName: "Name",
  email: "Email",
  phone: "Phone",
  location: "Location",
};

export async function saveContactAction(
  _: ContactFormState,
  form: FormData,
): Promise<ContactFormState> {
  const { userId } = await requireMember();
  const text = (name: string) => String(form.get(name) ?? "");
  const labels = form.getAll("linkLabel").map(String);
  const links = form
    .getAll("linkUrl")
    .map(String)
    .map((url, i) => ({ label: labels[i] ?? "", url }))
    // An empty row is a row the member did not fill in, not an error.
    .filter((l) => l.url.trim() !== "");
  const result = await saveContact(userId, {
    fullName: text("fullName"),
    email: text("email"),
    phone: text("phone"),
    location: text("location"),
    links,
  });
  if (!result.ok) {
    const field = result.field.startsWith("links")
      ? `Link ${Number(result.field.split(".")[1] ?? 0) + 1}`
      : (fieldNames[result.field] ?? "A field");
    return {
      error: `${field}: ${result.field.startsWith("links") ? "enter a web address like linkedin.com/in/you." : result.message}`,
    };
  }
  revalidatePath("/profile");
  revalidatePath("/resumes", "layout");
  return { message: "Saved. New and re-saved resumes use these details." };
}
