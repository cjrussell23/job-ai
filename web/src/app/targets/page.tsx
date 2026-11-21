import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { SiteHeader } from "@/components/site-header";
import { requireMember } from "@/features/members/session";
import { RefreshWhile } from "@/features/profile/components/refresh-while";
import { TargetCard } from "@/features/targets/components/target-card";
import { TargetForm } from "@/features/targets/components/target-form";
import { listTargets } from "@/features/targets/targets";

async function Targets() {
  const { userId, name, member } = await requireMember();
  const targets = await listTargets(userId);
  return (
    <>
      <SiteHeader name={name} isAdmin={member.role === "admin"} />
      <RefreshWhile active={targets.some((t) => t.searchTitleState === "proposing")} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Job targets</h1>
          <p className="text-muted-foreground">
            Each target describes a job you want. The daily search uses its approved titles, and
            every job is scored against it. Firm limits hide jobs outright; everything else only
            moves the score.
          </p>
        </div>
        {targets.map((target) => (
          <TargetCard key={target.id} target={target} />
        ))}
        <details className="rounded-lg border border-dashed p-4" open={targets.length === 0}>
          <summary className="cursor-pointer text-sm font-medium">Add a job target</summary>
          <div className="mt-4">
            <TargetForm />
          </div>
        </details>
      </main>
    </>
  );
}

export default function TargetsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Targets />
    </Suspense>
  );
}
