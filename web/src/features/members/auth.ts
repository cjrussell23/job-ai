import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { authEnv } from "@/lib/env";
import { checkSignIn, isMemberActive, linkMemberToUser } from "./members";

function createAuth() {
  const config = authEnv();
  return betterAuth({
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), { provider: "pg", schema }),
    socialProviders: {
      google: {
        clientId: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        prompt: "select_account",
      },
    },
    user: {
      // Runs before an account is created and on every later Google sign-in,
      // so this is where invite-only access is enforced.
      validateUserInfo: async ({ user }) => {
        const decision = await checkSignIn(user.email);
        if (decision === "allowed") return;
        return decision === "suspended"
          ? { error: "suspended", errorDescription: "Your access has been suspended." }
          : {
              error: "not_invited",
              errorDescription: "This Google account has not been invited.",
            };
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (created) => {
            await linkMemberToUser(created.email, created.id);
          },
        },
      },
      session: {
        create: {
          // A second guard in case a session is created by a path that skips validateUserInfo.
          before: async (session) => {
            if (!(await isMemberActive(session.userId))) return false;
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

/** The Better Auth instance, built on first use so builds and the worker need no auth settings. */
export function auth() {
  instance ??= createAuth();
  return instance;
}
