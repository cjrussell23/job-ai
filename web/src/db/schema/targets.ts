import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const payBasis = pgEnum("pay_basis", ["hourly", "annual"]);

/** Where the user will work: only remotely, locally or remotely, or only locally. */
export const workplace = pgEnum("workplace", ["remote_only", "local_or_remote", "local_only"]);

export const searchTitleState = pgEnum("search_title_state", [
  "none",
  "proposing",
  "proposed",
  "failed",
]);

/** A user's saved description of a job they want. */
export const jobTargets = pgTable("job_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  roleType: text("role_type").notNull(),
  /** Titles the user approved; only these are searched. */
  searchTitles: text("search_titles").array().notNull().default([]),
  /** Titles the AI proposed, waiting for the user to edit and approve. */
  proposedSearchTitles: text("proposed_search_titles").array().notNull().default([]),
  searchTitleState: searchTitleState("search_title_state").notNull().default("none"),
  locations: text("locations").array().notNull().default([]),
  workplace: workplace("workplace").notNull().default("local_or_remote"),
  locationIsFirm: boolean("location_is_firm").notNull().default(false),
  /** For a firm location limit: hide jobs whose postings do not state a location. */
  hideUnknownLocation: boolean("hide_unknown_location").notNull().default(false),
  /** In cents, on the target's pay basis. */
  minPayCents: integer("min_pay_cents"),
  payBasis: payBasis("pay_basis").notNull().default("annual"),
  /** Hours a week the user wants to work; used to compare hourly and annual pay. */
  desiredHours: integer("desired_hours"),
  payIsFirm: boolean("pay_is_firm").notNull().default(false),
  /** For a firm pay limit: hide jobs whose postings do not state pay. */
  hideUnknownPay: boolean("hide_unknown_pay").notNull().default(false),
  note: text("note").notNull().default(""),
  active: boolean("active").notNull().default(true),
  /** Last edit that can affect target fit; compared with when each match was scored. */
  scoringChangedAt: timestamp("scoring_changed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type JobTarget = typeof jobTargets.$inferSelect;
