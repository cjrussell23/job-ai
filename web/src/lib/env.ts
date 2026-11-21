import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

const authEnvSchema = z.object({
  /** Public URL the app is reached at, e.g. https://jobs.example.com. */
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  /** The admin's Google address; lets the admin sign in to an empty database. */
  ADMIN_EMAIL: z.email().transform((email) => email.toLowerCase()),
});

const aiEnvSchema = z.object({
  /** Vercel AI Gateway key; every model call goes through the gateway. */
  AI_GATEWAY_API_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema>;

let cached: Env | undefined;
let cachedAuth: AuthEnv | undefined;
let cachedAi: z.infer<typeof aiEnvSchema> | undefined;

function parse<T extends z.ZodType>(schema: T): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

// Parsed on first use rather than at import, so `next build` can run without
// a database configured.
export function env(): Env {
  cached ??= parse(envSchema);
  return cached;
}

/** Sign-in settings, separate so the worker and tests can run without them. */
export function authEnv(): AuthEnv {
  cachedAuth ??= parse(authEnvSchema);
  return cachedAuth;
}

/** Model provider settings, read only when a model is actually called. */
export function aiEnv(): z.infer<typeof aiEnvSchema> {
  cachedAi ??= parse(aiEnvSchema);
  return cachedAi;
}

const scraperEnvSchema = z.object({
  /** The JobSpy scraper service, on the internal Docker network. */
  SCRAPER_URL: z.url().default("http://scraper:8000"),
});
let cachedScraper: z.infer<typeof scraperEnvSchema> | undefined;

export function scraperEnv(): z.infer<typeof scraperEnvSchema> {
  cachedScraper ??= parse(scraperEnvSchema);
  return cachedScraper;
}

// Docker Compose passes an unset optional variable as an empty string.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const notifyEnvSchema = z.object({
  /** Discord bot token; without it, no messages are sent. */
  DISCORD_BOT_TOKEN: optional(z.string().min(1)),
  /** Public address of the app, for links in messages. */
  BETTER_AUTH_URL: optional(z.url()),
});
let cachedNotify: z.infer<typeof notifyEnvSchema> | undefined;

export function notifyEnv(): z.infer<typeof notifyEnvSchema> {
  cachedNotify ??= parse(notifyEnvSchema);
  return cachedNotify;
}
