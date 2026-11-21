import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("rejects a missing database URL with a readable message", async () => {
  vi.stubEnv("DATABASE_URL", "");
  const { env } = await import("./env");
  expect(() => env()).toThrow(/DATABASE_URL/);
});

test("applies defaults", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://localhost:5432/x");
  vi.stubEnv("LOG_LEVEL", undefined);
  const { env } = await import("./env");
  expect(env().LOG_LEVEL).toBe("info");
});

test("an empty optional variable counts as unset", async () => {
  vi.stubEnv("DISCORD_BOT_TOKEN", "");
  vi.stubEnv("BETTER_AUTH_URL", "");
  const { notifyEnv } = await import("./env");
  expect(notifyEnv()).toEqual({ DISCORD_BOT_TOKEN: undefined, BETTER_AUTH_URL: undefined });
});
