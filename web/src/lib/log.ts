import { randomUUID } from "node:crypto";
import pino from "pino";

// Never pass profile content or document text to the logger: log ids and counts only.
export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.SERVICE_NAME ?? "web" },
});

export type Logger = typeof log;

/** A child logger tagged with a run id, so one run can be traced across services. */
export function runLogger(runId: string = randomUUID()): Logger {
  return log.child({ runId });
}
