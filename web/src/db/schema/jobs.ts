import {
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const jobState = pgEnum("job_state", ["open", "closed"]);
export const remoteType = pgEnum("remote_type", ["remote", "hybrid", "onsite", "unknown"]);
export const payPeriod = pgEnum("pay_period", ["hour", "day", "week", "month", "year"]);
export const certainty = pgEnum("certainty", ["low", "medium", "high"]);

/** One role at one company in one location, shared by all users (ADR 0001). */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Normalized company, title and location; how postings find their job. */
    identityKey: text("identity_key").notNull().unique(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    location: text("location").notNull(),
    remote: remoteType("remote").notNull().default("unknown"),
    /** Stated pay, as posted. Null when no posting states it. */
    payMin: doublePrecision("pay_min"),
    payMax: doublePrecision("pay_max"),
    payPeriod: payPeriod("pay_period"),
    hoursPerWeek: integer("hours_per_week"),
    /**
     * Where stated pay came from: null when a posting's pay field gave it, "description"
     * when it was read from the job description, with a quote checked against the text.
     */
    payStatedIn: text("pay_stated_in").$type<"description">(),
    /** A guess for jobs that state no pay (ADR 0002): always labelled, never a firm limit. */
    payEstimateMin: doublePrecision("pay_estimate_min"),
    payEstimateMax: doublePrecision("pay_estimate_max"),
    payEstimatePeriod: payPeriod("pay_estimate_period"),
    payEstimateCertainty: certainty("pay_estimate_certainty"),
    payEstimateReason: text("pay_estimate_reason"),
    description: text("description").notNull().default(""),
    /** Greenhouse, Lever, Workday and so on, from the posting links; for auto-apply later. */
    applicationSystem: text("application_system"),
    state: jobState("state").notNull().default("open"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [index("jobs_state_idx").on(table.state)],
);

export type Job = typeof jobs.$inferSelect;

/** One advertisement of a job on one source. */
export const postings = pgTable(
  "postings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    url: text("url").notNull().unique(),
    /** As the source wrote them, before normalization. */
    title: text("title").notNull(),
    company: text("company").notNull(),
    location: text("location").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    /** The search title that first found this posting; links search results to targets. */
    foundBy: text("found_by"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Consecutive daily runs in which the source no longer listed this posting. */
    missingRuns: integer("missing_runs").notNull().default(0),
  },
  (table) => [
    index("postings_job_idx").on(table.jobId),
    index("postings_source_idx").on(table.source),
  ],
);

export type Posting = typeof postings.$inferSelect;

/** A member's "these are not the same job": the posting was moved to a job of its own. */
export const jobSplits = pgTable("job_splits", {
  id: uuid("id").primaryKey().defaultRandom(),
  postingId: uuid("posting_id")
    .notNull()
    .references(() => postings.id, { onDelete: "cascade" }),
  fromJobId: uuid("from_job_id").notNull(),
  toJobId: uuid("to_job_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One search of one source within a daily run, for spotting broken sources. */
export const scrapeRuns = pgTable(
  "scrape_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: text("run_id").notNull(),
    source: text("source").notNull(),
    /** The search title or watched company that was queried. */
    query: text("query").notNull(),
    location: text("location").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
    found: integer("found").notNull().default(0),
    newPostings: integer("new_postings").notNull().default(0),
    error: text("error"),
  },
  (table) => [index("scrape_runs_finished_idx").on(table.finishedAt)],
);

export type ScrapeRun = typeof scrapeRuns.$inferSelect;

export const boardSystem = pgEnum("board_system", ["greenhouse", "lever", "ashby", "workday"]);
export const watchedCompanyOrigin = pgEnum("watched_company_origin", ["member", "discovered"]);

/** A company whose public job board feed is read every run. Shared by all users. */
export const watchedCompanies = pgTable(
  "watched_companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    system: boardSystem("system").notNull(),
    /** The company's id on that system, e.g. the "acme" in boards.greenhouse.io/acme. */
    boardId: text("board_id").notNull(),
    origin: watchedCompanyOrigin("origin").notNull(),
    // Not "user_id": the company stays watched after the member who added it leaves.
    addedByUserId: text("added_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("watched_companies_board_idx").on(table.system, table.boardId)],
);

export type WatchedCompany = typeof watchedCompanies.$inferSelect;

export const memberPaySource = pgEnum("member_pay_source", ["entered", "confirmed_estimate"]);

/**
 * Pay a member knows for a job, typed in or confirmed from the estimate (ADR 0003).
 * Private to that member: it counts as known pay for their own firm limits and
 * scoring, and nobody else sees it.
 */
export const memberJobPay = pgTable(
  "member_job_pay",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    payMin: doublePrecision("pay_min").notNull(),
    payMax: doublePrecision("pay_max").notNull(),
    payPeriod: payPeriod("pay_period").notNull(),
    source: memberPaySource("source").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("member_job_pay_user_job_idx").on(table.userId, table.jobId)],
);

export type MemberJobPay = typeof memberJobPay.$inferSelect;

export const boardCheckStatus = pgEnum("board_check_status", ["found", "not_found"]);

/**
 * Whether a company that shows up in matches has its own Greenhouse, Lever or Ashby
 * board, found by trying its name as the board id. Shared like the companies
 * themselves; members see the found ones as suggestions to watch.
 */
export const companyBoardChecks = pgTable("company_board_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** The company name normalized as for job identity, e.g. "affirm". */
  companyKey: text("company_key").notNull().unique(),
  companyName: text("company_name").notNull(),
  status: boardCheckStatus("status").notNull(),
  system: boardSystem("system"),
  boardId: text("board_id"),
  openJobs: integer("open_jobs"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CompanyBoardCheck = typeof companyBoardChecks.$inferSelect;
