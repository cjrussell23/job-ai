import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
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

export type Env = z.infer<typeof envSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema>;

let cached: Env | undefined;
let cachedAuth: AuthEnv | undefined;

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
