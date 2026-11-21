import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Points every test at the test database and applies migrations once.
 * Tests truncate tables, so they read TEST_DATABASE_URL and never DATABASE_URL.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/jobai_test";
  process.env.DATABASE_URL = url;
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  await sql.end();
}
