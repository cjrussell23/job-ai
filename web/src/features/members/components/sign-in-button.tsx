"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/features/members/auth-client";

export function SignInButton() {
  const [pending, setPending] = useState(false);
  return (
    <Button
      size="lg"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signIn.social({
          provider: "google",
          callbackURL: "/",
          errorCallbackURL: "/sign-in",
        });
      }}
    >
      {pending ? "Opening Google…" : "Sign in with Google"}
    </Button>
  );
}
