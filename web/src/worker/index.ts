import { closeDb } from "@/db/client";
import { log } from "@/lib/log";
import { queue, queues, stopQueue } from "@/lib/queue";

async function main() {
  const boss = await queue();

  // Proves the worker is alive and the schedule runs; real jobs replace it in later phases.
  await boss.schedule(queues.heartbeat, "0 * * * *");
  await boss.work(queues.heartbeat, async () => {
    log.info("worker heartbeat");
  });

  log.info("worker started");

  const shutdown = async (signal: string) => {
    log.info({ signal }, "worker stopping");
    await stopQueue();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  log.fatal({ err: error }, "worker failed to start");
  process.exit(1);
});
