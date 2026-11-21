import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInButton } from "@/features/members/components/sign-in-button";

const errorMessages: Record<string, string> = {
  not_invited: "That Google account has not been invited. Ask the admin to add it.",
  suspended: "Your access has been suspended. Contact the admin.",
};

async function SignInError({
  searchParams,
}: {
  searchParams: PageProps<"/sign-in">["searchParams"];
}) {
  const { error, deleted } = await searchParams;
  if (deleted === "1") {
    return (
      <p className="text-sm text-muted-foreground">Your account and data have been deleted.</p>
    );
  }
  if (typeof error !== "string") return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {errorMessages[error] ?? "Sign-in did not complete. Try again."}
    </p>
  );
}

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Job Search</CardTitle>
          <CardDescription>
            Invite only. Sign in with the Google account you were invited with.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Suspense>
            <SignInError searchParams={searchParams} />
          </Suspense>
          <SignInButton />
        </CardContent>
      </Card>
    </main>
  );
}
