import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const profileItemType = pgEnum("profile_item_type", [
  "role",
  "bullet",
  "project",
  "skill",
  "certification",
  "story",
  "note",
]);

/**
 * `auto` lets tailoring decide; the other three are the user's explicit choices.
 */
export const profileItemVisibility = pgEnum("profile_item_visibility", [
  "auto",
  "always",
  "never",
  "cover_letter_only",
]);

export const profileItemSource = pgEnum("profile_item_source", [
  "upload",
  "manual",
  "question",
  "tailored_document",
]);

/** One fact or piece of writing in a user's master profile. */
export const profileItems = pgTable(
  "profile_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: profileItemType("type").notNull(),
    /** Bullets belong to a role or project. */
    parentId: uuid("parent_id").references((): AnyPgColumn => profileItems.id, {
      onDelete: "cascade",
    }),
    /** Job title, project or skill name, certification name; empty for bullets and notes. */
    title: text("title").notNull().default(""),
    /** Employer, client or issuing body. */
    organization: text("organization").notNull().default(""),
    content: text("content").notNull().default(""),
    /** Free-form dates as written, e.g. "2021-03" or "Spring 2019". */
    startDate: text("start_date").notNull().default(""),
    endDate: text("end_date").notNull().default(""),
    tags: text("tags").array().notNull().default([]),
    visibility: profileItemVisibility("visibility").notNull().default("auto"),
    source: profileItemSource("source").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("profile_items_user_idx").on(table.userId, table.type, table.position)],
);

export type ProfileItem = typeof profileItems.$inferSelect;

export const resumeUploadState = pgEnum("resume_upload_state", ["parsing", "done", "failed"]);

/** An uploaded resume and the text extracted from it, kept so parsing can be retried. */
export const resumeUploads = pgTable("resume_uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  text: text("text").notNull(),
  state: resumeUploadState("state").notNull().default("parsing"),
  /** A readable reason when parsing failed. */
  failure: text("failure"),
  itemsCreated: integer("items_created").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ResumeUpload = typeof resumeUploads.$inferSelect;

/**
 * How a member is reached, for the header of every resume and cover letter.
 * One row per member; empty fields fall back to the Google account's name and email.
 */
export const profileContacts = pgTable("profile_contacts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  location: text("location").notNull().default(""),
  /** Ordered links such as LinkedIn, GitHub or a portfolio: `{ label, url }`. */
  links: jsonb("links").$type<{ label: string; url: string }[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProfileContact = typeof profileContacts.$inferSelect;
