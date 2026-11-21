import { integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const memberRole = pgEnum("member_role", ["admin", "member"]);
export const memberState = pgEnum("member_state", ["invited", "active", "suspended"]);

/**
 * The invite list and each person's app-level settings. A row exists from the
 * moment the admin invites a Google address; `userId` is filled on first sign-in.
 */
export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  userId: text("user_id")
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  role: memberRole("role").notNull().default("member"),
  state: memberState("state").notNull().default("invited"),
  /** Matches above this combined score are included in notifications. */
  scoreThreshold: integer("score_threshold").notNull().default(70),
  /** Share of the combined score taken from target fit, in percent. */
  targetFitWeight: integer("target_fit_weight").notNull().default(60),
  /** Monthly AI spend cap in cents; null means the app-wide default. */
  spendCapCents: integer("spend_cap_cents"),
  /** The member's Discord user id, for daily match messages. Null means no messages. */
  discordUserId: text("discord_user_id"),
  /** Last change to the master profile that can affect profile fit. */
  profileChangedAt: timestamp("profile_changed_at", { withTimezone: true }),
  invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
  firstSignInAt: timestamp("first_sign_in_at", { withTimezone: true }),
});

export type Member = typeof members.$inferSelect;
