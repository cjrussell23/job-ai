import Link from "next/link";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { SiteHeader } from "@/components/site-header";
import { requireMember } from "@/features/members/session";
import { FeedCard } from "@/features/scoring/components/feed-card";
import { FeedFilters } from "@/features/scoring/components/feed-filters";
import { RescoreBanner } from "@/features/scoring/components/rescore-banner";
import { feedForUser } from "@/features/scoring/feed";
import { applyFeedView, parseFeedView } from "@/features/scoring/feed-view";
import { rescoreStatus } from "@/features/scoring/rescore";
import { sourceLabel } from "@/features/sources/catalogue";
import { listTargets } from "@/features/targets/targets";

async function Feed({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { userId, name, member } = await requireMember();
  const [items, rescore, targets, params] = await Promise.all([
    feedForUser(userId, member.targetFitWeight),
    rescoreStatus(userId),
    listTargets(userId),
    searchParams,
  ]);
  const view = parseFeedView(params);
  const shown = applyFeedView(items, view);
  const sources = [...new Set(items.flatMap((i) => i.job.postings.map((p) => p.source)))].map(
    (id) => ({ value: id, label: sourceLabel(id) }),
  );

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
        <RescoreBanner status={rescore} />
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
          <>
            <FeedFilters
              view={view}
              targets={targets.map((t) => ({ value: t.id, label: t.roleType }))}
              sources={sources}
              shown={shown.length}
              total={items.length}
            />
            {shown.length === 0 && (
              <p className="rounded-lg border p-6 text-muted-foreground">
                No jobs match these filters.
              </p>
            )}
            {shown.map((item) => (
              <FeedCard key={item.job.id} item={item} />
            ))}
          </>
        )}
      </main>
    </>
  );
}

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Feed searchParams={searchParams} />
    </Suspense>
  );
}
