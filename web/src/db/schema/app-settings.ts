import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** App-wide settings the admin changes from the dashboard. */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
