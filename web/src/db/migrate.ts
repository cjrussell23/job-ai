import { migrate } from "drizzle-orm/postgres-js/migrator";
import { log } from "@/lib/log";
import { closeDb, db } from "./client";

async function main() {
  await migrate(db(), { migrationsFolder: "drizzle" });
  log.info("database migrations applied");
  await closeDb();
}

main().catch((error: unknown) => {
  log.fatal({ err: error }, "database migration failed");
  process.exit(1);
});
