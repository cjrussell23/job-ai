import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { resetDb } from "@/test/db";
import { appSettings } from "./app-settings";

beforeEach(resetDb);
afterAll(closeDb);

test("app settings store JSON values by key", async () => {
  await db().insert(appSettings).values({ key: "rescoreLimitPerDay", value: 1 });
  const [row] = await db()
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "rescoreLimitPerDay"));
  expect(row?.value).toBe(1);
});
