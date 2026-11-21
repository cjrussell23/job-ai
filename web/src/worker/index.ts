import { z } from "zod";
import { closeDb } from "@/db/client";
import { getSettings } from "@/features/admin/settings";
import { generateDocument } from "@/features/documents/generate";
import { learnPreferencesForAll } from "@/features/feedback/learn";
import { notifyNewMatches } from "@/features/notifications/notify";
import { parseUpload } from "@/features/profile/parse-upload";
import { runReview } from "@/features/profile/review";
import { executeRun, startScheduledRunIfDue } from "@/features/runs/daily-run";
import { runRescore } from "@/features/scoring/rescore";
import { scoreAfterRun } from "@/features/scoring/score";
import { registerAllSources } from "@/features/sources";
import { proposeTitlesForTarget } from "@/features/targets/propose-titles";
import { log } from "@/lib/log";
import { queue, queues, stopQueue } from "@/lib/queue";

async function main() {
  registerAllSources();
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

  // The daily search: checked every ten minutes against the admin's run time, so a
  // change takes effect without a restart and a missed day is caught up.
  const checkSchedule = async () => {
    const { dailyRunTime } = await getSettings();
    const result = await startScheduledRunIfDue(dailyRunTime);
    if (result.started) await boss.send(queues.dailyRun, { runId: result.runId });
  };
  await boss.schedule(queues.dailyRunCheck, "*/10 * * * *");
  await boss.work(queues.dailyRunCheck, checkSchedule);
  const dailyRunJob = z.object({ runId: z.uuid() });
  // A run can take a while (Job Bank asks for five seconds between pages).
  await boss.work(queues.dailyRun, { localConcurrency: 1 }, async (jobs) => {
    for (const job of jobs) {
      const { runId } = dailyRunJob.parse(job.data);
      log.info({ runId }, "daily run starting");
      await executeRun(runId, {
        // Preferences are learned first so today's scoring uses them.
        afterRun: async () => ({
          preferences: await learnPreferencesForAll().catch((err: unknown) => {
            log.error({ err }, "learning preferences failed");
            return { learned: 0 };
          }),
          ...(await scoreAfterRun()),
          notifications: await notifyNewMatches(),
        }),
      });
    }
  });
  await checkSchedule();

  const draftJob = z.object({
    userId: z.string(),
    documentId: z.uuid(),
    jobId: z.uuid(),
    kind: z.enum(["resume", "cover_letter"]),
  });
  await boss.work(queues.draftDocument, async (jobs) => {
    for (const job of jobs) {
      const { userId, documentId, jobId, kind } = draftJob.parse(job.data);
      log.info({ documentId, kind }, "drafting document");
      await generateDocument(userId, documentId, jobId, kind);
    }
  });

  const rescoreJob = z.object({ userId: z.string(), requestId: z.uuid() });
  await boss.work(queues.rescore, async (jobs) => {
    for (const job of jobs) {
      const { userId, requestId } = rescoreJob.parse(job.data);
      const { scored } = await runRescore(userId, requestId);
      log.info({ requestId, scored }, "rescore finished");
    }
  });

  const reviewJob = z.object({ userId: z.string(), reviewId: z.uuid() });
  await boss.work(queues.reviewProfile, async (jobs) => {
    for (const job of jobs) {
      const { userId, reviewId } = reviewJob.parse(job.data);
      log.info({ reviewId }, "reviewing profile");
      await runReview(userId, reviewId);
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
