import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

/** Queue names. Every job the worker runs is listed here. */
export const queues = {
  heartbeat: "heartbeat",
  parseResume: "parse-resume",
} as const;

export type QueueName = (typeof queues)[keyof typeof queues];

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
      await instance.createQueue(name);
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
