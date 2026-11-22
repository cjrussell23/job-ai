import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

/** Queue names. Every job the worker runs is listed here. */
export const queues = {
  heartbeat: "heartbeat",
  dailyRunCheck: "daily-run-check",
  dailyRun: "daily-run",
  parseResume: "parse-resume",
  proposeSearchTitles: "propose-search-titles",
  rescore: "rescore",
  draftDocument: "draft-document",
  reviewProfile: "review-profile",
  pickResumeItems: "pick-resume-items",
  reviewResume: "review-resume",
  checkCompanyBoards: "check-company-boards",
  draftInterviewQuestions: "draft-interview-questions",
  rateInterviewAnswer: "rate-interview-answer",
} as const;

export type QueueName = (typeof queues)[keyof typeof queues];

/** Per-queue settings; the rest use pg-boss defaults. */
const queueOptions: Partial<Record<QueueName, { expireInSeconds?: number; retryLimit?: number }>> =
  {
    // A daily run can take hours and must not be retried into a second run.
    [queues.dailyRun]: { expireInSeconds: 4 * 60 * 60, retryLimit: 0 },
  };

let boss: PgBoss | undefined;
let starting: Promise<PgBoss> | undefined;

/** The shared pg-boss instance. The web app uses it to enqueue work; the worker also runs it. */
export function queue(): Promise<PgBoss> {
  if (boss) return Promise.resolve(boss);
  starting ??= (async () => {
    const instance = new PgBoss({ connectionString: env().DATABASE_URL });
    instance.on("error", (error: unknown) => log.error({ err: error }, "queue error"));
    await instance.start();
    for (const name of Object.values(queues)) {
      await instance.createQueue(name, queueOptions[name] ?? {});
    }
    boss = instance;
    return instance;
  })();
  return starting;
}

export async function stopQueue(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = undefined;
    starting = undefined;
  }
}
