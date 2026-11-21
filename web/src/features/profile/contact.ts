import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { type ProfileContact, profileContacts } from "@/db/schema";
import { memberHeader } from "@/features/members/members";

export type { ProfileContact };

export const contactLinkSchema = z.object({
  label: z.string().trim().max(40),
  url: z
    .string()
    .trim()
    .min(1)
    .max(300)
    // People type "linkedin.com/in/me"; store a full URL so the PDF link works.
    .transform((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`))
    .pipe(z.url({ protocol: /^https?$/ })),
});
export type ContactLink = z.infer<typeof contactLinkSchema>;

export const contactSchema = z.object({
  fullName: z.string().trim().max(100),
  email: z.union([z.literal(""), z.email().max(200)]),
  phone: z.string().trim().max(40),
  location: z.string().trim().max(100),
  links: z.array(contactLinkSchema).max(8),
});
export type ContactInput = z.input<typeof contactSchema>;

/** What the top of a resume or cover letter shows. */
export type DocumentHeader = { name: string; contact: string; links: ContactLink[] };

export async function getContact(userId: string): Promise<ProfileContact | undefined> {
  const [row] = await db().select().from(profileContacts).where(eq(profileContacts.userId, userId));
  return row;
}

export type ContactResult = { ok: true } | { ok: false; field: string; message: string };

export async function saveContact(userId: string, input: ContactInput): Promise<ContactResult> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".") ?? "";
    return { ok: false, field, message: issue?.message ?? "Check the details." };
  }
  const values = { ...parsed.data, updatedAt: new Date() };
  await db()
    .insert(profileContacts)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: profileContacts.userId, set: values });
  return { ok: true };
}

/** A link as printed: the address without the protocol or a trailing slash. */
export function linkText(link: ContactLink): string {
  return link.url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}

/** Pure: the header, falling back to the Google account for anything left blank. */
export function headerFrom(
  contact: Pick<ProfileContact, "fullName" | "email" | "phone" | "location" | "links"> | undefined,
  account: { name: string; email: string },
): DocumentHeader {
  const email = contact?.email || account.email;
  return {
    name: contact?.fullName || account.name,
    contact: [email, contact?.phone, contact?.location].filter(Boolean).join(" · "),
    links: contact?.links ?? [],
  };
}

export async function documentHeader(userId: string): Promise<DocumentHeader> {
  const [contact, account] = await Promise.all([getContact(userId), memberHeader(userId)]);
  return headerFrom(contact, account);
}
