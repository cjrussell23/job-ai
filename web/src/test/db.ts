import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/** Empties every application table between tests. */
export async function resetDb(): Promise<void> {
  const rows = await db().execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const tables = rows.map((r) => `"${r.tablename}"`);
  if (tables.length > 0) {
    await db().execute(sql.raw(`truncate ${tables.join(", ")} restart identity cascade`));
  }
}
