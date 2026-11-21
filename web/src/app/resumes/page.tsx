import Link from "next/link";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { RefreshWhile } from "@/components/refresh-while";
import { SiteHeader } from "@/components/site-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { listStandingResumes } from "@/features/documents/standing";
import { pickForTargetAction } from "@/features/documents/standing-actions";
import { requireMember } from "@/features/members/session";
import { appTimeZone } from "@/features/runs/time";
import { listTargets, targetLabel } from "@/features/targets/targets";

const day = (date: Date) =>
  date.toLocaleDateString("en-CA", { timeZone: appTimeZone, dateStyle: "medium" });

async function Resumes() {
  const { userId, name, member } = await requireMember();
  const [resumes, targets] = await Promise.all([listStandingResumes(userId), listTargets(userId)]);
  const picking = resumes.some((r) => r.state === "generating");
  return (
    <>
      <SiteHeader name={name} isAdmin={member.role === "admin"} />
      <RefreshWhile active={picking} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Standing resumes</h1>
            <p className="text-muted-foreground">
              Resumes you build yourself from your profile, ready for any application. For one job,
              tailor a resume from the job's page instead.
            </p>
          </div>
          <Link href="/resumes/new" className={buttonVariants()}>
            New resume
          </Link>
        </div>
        {targets.length > 0 && (
          <form
            action={pickForTargetAction}
            className="flex flex-wrap items-end gap-3 rounded-lg border p-4 text-sm"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="pick-target" className="font-medium">
                Start from a job target
              </label>
              <select
                id="pick-target"
                name="targetId"
                className="h-9 rounded-md border bg-background px-2"
              >
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {targetLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline">
              Pick items for me
            </Button>
            <p className="basis-full text-xs text-muted-foreground">
              The AI chooses the roles, bullets, projects and skills that fit the target, in your
              profile's own words. You adjust the picks afterwards. Uses one AI call.
            </p>
          </form>
        )}
        {resumes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No standing resumes yet.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {resumes.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <Link href={`/resumes/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {r.state === "generating"
                      ? "Picking items…"
                      : r.state === "failed"
                        ? `Picking failed: ${r.failure ?? "try again"}`
                        : `Updated ${day(r.updatedAt)}`}
                  </p>
                </div>
                {r.state === "approved" && (
                  <a
                    href={`/documents/${r.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Download PDF
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Resumes />
    </Suspense>
  );
}
