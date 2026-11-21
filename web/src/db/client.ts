import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

let instance: { db: Database; sql: postgres.Sql } | undefined;

function connect() {
  if (!instance) {
    const sql = postgres(env().DATABASE_URL, { max: 10 });
    instance = { db: drizzle(sql, { schema }), sql };
  }
  return instance;
}

/** The shared database handle, opened on first use. */
export function db(): Database {
  return connect().db;
}

export async function closeDb(): Promise<void> {
  if (instance) {
    await instance.sql.end();
    instance = undefined;
  }
}
