import Link from "next/link";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { listStandingResumes } from "@/features/documents/standing";
import { requireMember } from "@/features/members/session";
import { appTimeZone } from "@/features/runs/time";

const day = (date: Date) =>
  date.toLocaleDateString("en-CA", { timeZone: appTimeZone, dateStyle: "medium" });

async function Resumes() {
  const { userId, name, member } = await requireMember();
  const resumes = await listStandingResumes(userId);
  return (
    <>
      <SiteHeader name={name} isAdmin={member.role === "admin"} />
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
                  <p className="text-xs text-muted-foreground">Updated {day(r.updatedAt)}</p>
                </div>
                <a
                  href={`/documents/${r.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Download PDF
                </a>
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
