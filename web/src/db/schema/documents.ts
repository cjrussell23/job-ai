import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { jobs } from "./jobs";

export const documentKind = pgEnum("document_kind", ["resume", "cover_letter"]);
export const documentState = pgEnum("document_state", [
  "generating",
  "draft",
  "approved",
  "failed",
]);

/**
 * A resume or cover letter. Tailored documents belong to a job; a standing resume
 * (built in the resume builder) has no job. The body is validated with Zod
 * (features/documents/body.ts): every line carries the profile items it came from.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    kind: documentKind("kind").notNull(),
    /** A member's own name for a standing resume; empty for tailored documents. */
    name: text("name").notNull().default(""),
    template: text("template").notNull().default("clean"),
    state: documentState("state").notNull().default("generating"),
    body: jsonb("body"),
    /** Increases with every regeneration, so a member can tell drafts apart. */
    version: integer("version").notNull().default(1),
    failure: text("failure"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("documents_user_job_idx").on(table.userId, table.jobId)],
);

export type Document = typeof documents.$inferSelect;
