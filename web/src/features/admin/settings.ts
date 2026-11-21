import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";

export { type AiTask, aiTaskLabels, aiTasks } from "./ai-tasks";

// AI Gateway model ids ("provider/model"). Any gateway model can be chosen per task.
const scoringModel = "anthropic/claude-haiku-5.5";
const writingModel = "anthropic/claude-sonnet-5.5";

const settingsSchema = z.object({
  models: z
    .object({
      parseResume: z.string().min(1).default(scoringModel),
      proposeSearchTitles: z.string().min(1).default(scoringModel),
      scoreTargetFit: z.string().min(1).default(scoringModel),
      scoreProfileFit: z.string().min(1).default(scoringModel),
      estimatePay: z.string().min(1).default(scoringModel),
      learnPreferences: z.string().min(1).default(scoringModel),
      draftCoverLetter: z.string().min(1).default(writingModel),
      tailorResume: z.string().min(1).default(writingModel),
      reviewProfile: z.string().min(1).default(writingModel),
      pickResumeItems: z.string().min(1).default(writingModel),
      reviewResume: z.string().min(1).default(writingModel),
      summarizeMatch: z.string().min(1).default(scoringModel),
    })
    .prefault({}),
  /** Monthly AI spend cap for members without their own cap, in cents. */
  defaultSpendCapCents: z.int().min(0).default(1000),
  /** Sources switched off by the admin; every available source is on unless set to false. */
  sourcesEnabled: z.record(z.string(), z.boolean()).default({}),
  /** When the daily search starts, Calgary time ("HH:MM"). */
  dailyRunTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default("05:00"),
  /** How many times a member may rescore their matches per day. */
  rescoreLimitPerDay: z.int().min(0).default(1),
  /** Matches below this combined score never get an AI summary, whatever a member sets. */
  summaryMinScore: z.int().min(0).max(100).default(75),
});

export type AppSettings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof AppSettings;
const settingKeys = Object.keys(settingsSchema.shape) as SettingKey[];

/** All app settings, with defaults filled in for any the admin has not set. */
export async function getSettings(): Promise<AppSettings> {
  const rows = await db().select().from(appSettings).where(inArray(appSettings.key, settingKeys));
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return settingsSchema.parse(stored);
}

export type SettingUpdateResult = { ok: true } | { ok: false; reason: "invalid" };

export async function setSetting<K extends SettingKey>(
  key: K,
  value: AppSettings[K],
): Promise<SettingUpdateResult> {
  const parsed = settingsSchema.shape[key].safeParse(value);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  await db()
    .insert(appSettings)
    .values({ key, value: parsed.data })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: parsed.data, updatedAt: sql`now()` },
    });
  return { ok: true };
}
