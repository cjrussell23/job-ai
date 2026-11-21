import Link from "next/link";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { SiteHeader } from "@/components/site-header";
import { requireMember } from "@/features/members/session";

async function Home() {
  const { name, member } = await requireMember();
  return (
    <>
      <SiteHeader name={name} isAdmin={member.role === "admin"} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {name.split(" ")[0]}</h1>
        <p className="text-muted-foreground">
          Start by building your{" "}
          <Link href="/profile" className="underline">
            master profile
          </Link>
          . Job targets arrive in the next step of the build; once they are in place, scored job
          matches will appear here every day.
        </p>
      </main>
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Home />
    </Suspense>
  );
}
