import { z } from "zod";
import { closeDb } from "@/db/client";
import { parseUpload } from "@/features/profile/parse-upload";
import { proposeTitlesForTarget } from "@/features/targets/propose-titles";
import { log } from "@/lib/log";
import { queue, queues, stopQueue } from "@/lib/queue";

async function main() {
  const boss = await queue();

  // Proves the worker is alive and the schedule runs; real jobs replace it in later phases.
  await boss.schedule(queues.heartbeat, "0 * * * *");
  await boss.work(queues.heartbeat, async () => {
    log.info("worker heartbeat");
  });

  const parseResumeJob = z.object({ userId: z.string(), uploadId: z.uuid() });
  await boss.work(queues.parseResume, async (jobs) => {
    for (const job of jobs) {
      const { userId, uploadId } = parseResumeJob.parse(job.data);
      log.info({ jobId: job.id, uploadId }, "parsing resume");
      await parseUpload(userId, uploadId);
    }
  });

  const proposeTitlesJob = z.object({ userId: z.string(), targetId: z.uuid() });
  await boss.work(queues.proposeSearchTitles, async (jobs) => {
    for (const job of jobs) {
      const { userId, targetId } = proposeTitlesJob.parse(job.data);
      log.info({ jobId: job.id, targetId }, "proposing search titles");
      await proposeTitlesForTarget(userId, targetId);
    }
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
