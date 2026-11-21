import Link from "next/link";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { SiteHeader } from "@/components/site-header";
import { requireMember } from "@/features/members/session";
import { FeedCard } from "@/features/scoring/components/feed-card";
import { feedForUser } from "@/features/scoring/feed";

async function Feed() {
  const { userId, name, member } = await requireMember();
  const items = await feedForUser(userId, member.targetFitWeight);
  return (
    <>
      <SiteHeader name={name} isAdmin={member.role === "admin"} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Your matches</h1>
          <p className="text-muted-foreground">
            New jobs are found every morning and scored twice: how well each suits what you want
            (target fit) and how well your profile suits it (profile fit).
          </p>
        </div>
        {items.length === 0 ? (
          <p className="rounded-lg border p-6 text-muted-foreground">
            No matches yet. Build your{" "}
            <Link href="/profile" className="underline">
              master profile
            </Link>{" "}
            and approve search titles on your{" "}
            <Link href="/targets" className="underline">
              job targets
            </Link>
            ; matches appear after the next daily run.
          </p>
        ) : (
          items.map((item) => <FeedCard key={item.job.id} item={item} />)
        )}
      </main>
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Feed />
    </Suspense>
  );
}
