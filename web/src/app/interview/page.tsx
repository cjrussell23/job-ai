import Link from "next/link";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { RefreshWhile } from "@/components/refresh-while";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { listApplications } from "@/features/applications/applications";
import { deleteSetAction, startSetAction } from "@/features/interview/actions";
import { QuestionCard } from "@/features/interview/components/question-card";
import { setsWithJobs } from "@/features/interview/interview";
import { jobsWithPostings } from "@/features/jobs/jobs";
import { requireMember } from "@/features/members/session";
import { listItems } from "@/features/profile/profile";

async function Interview({
  searchParams,
}: {
  searchParams: PageProps<"/interview">["searchParams"];
}) {
  const { userId, name, member } = await requireMember();
  const params = await searchParams;
  const [sets, applications, items] = await Promise.all([
    setsWithJobs(userId),
    listApplications(userId),
    listItems(userId),
  ]);
  const boardJobs = await jobsWithPostings(applications.map((a) => a.jobId));
  const jobsWithSets = new Set(sets.flatMap((s) => (s.jobId ? [s.jobId] : [])));
  const chosenId = typeof params.set === "string" ? params.set : sets[0]?.id;
  const chosen = sets.find((s) => s.id === chosenId) ?? sets[0];
  const byScore = params.sort === "score";
  const parentName = new Map(
    items
      .filter((i) => i.type === "role" || i.type === "project")
      .map((i) => [i.id, [i.title, i.organization].filter(Boolean).join(" · ")]),
  );
  const questions = chosen
    ? byScore
      ? [...chosen.questions].sort((a, b) => (a.score ?? 101) - (b.score ?? 101))
      : chosen.questions
    : [];
  const rated = chosen?.questions.filter((q) => q.score !== null) ?? [];
  const average = rated.length
    ? Math.round(rated.reduce((sum, q) => sum + (q.score ?? 0), 0) / rated.length)
    : null;
  const busy =
    sets.some((s) => s.state === "generating") ||
    (chosen?.questions.some((q) => q.ratingState === "rating") ?? false);
  const label = (s: (typeof sets)[number]) =>
    s.jobId ? (s.jobTitle ?? "A job") : "General practice";

  return (
    <>
      <SiteHeader name={name} isAdmin={member.role === "admin"} />
      <RefreshWhile active={busy} />
      <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Interview practice</h1>
            <p className="text-sm text-muted-foreground">
              Questions you're likely to be asked. Write your answers, have them rated, and add
              what's new in them to your profile.
            </p>
          </div>
          <form action={startSetAction}>
            <Button type="submit" size="sm" className="w-full">
              New general practice set
            </Button>
          </form>
          {boardJobs.filter((j) => !jobsWithSets.has(j.id)).length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Prepare for a job on your board
              </p>
              {boardJobs
                .filter((j) => !jobsWithSets.has(j.id))
                .map((j) => (
                  <form key={j.id} action={startSetAction}>
                    <input type="hidden" name="jobId" value={j.id} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      className="h-auto w-full justify-start py-1.5 text-left whitespace-normal"
                    >
                      {j.title} at {j.company}
                    </Button>
                  </form>
                ))}
            </div>
          )}
          {sets.length > 0 && (
            <nav className="flex flex-col gap-1 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Your sets</p>
              {sets.map((s) => (
                <Link
                  key={s.id}
                  href={`/interview?set=${s.id}`}
                  className={`rounded px-2 py-1.5 hover:bg-muted ${s.id === chosen?.id ? "bg-muted font-medium" : ""}`}
                >
                  {label(s)}
                  <span className="block text-xs text-muted-foreground">
                    {s.state === "generating"
                      ? "Writing questions…"
                      : s.state === "failed"
                        ? "Failed"
                        : `${s.questions.filter((q) => q.score !== null).length} of ${s.questions.length} rated`}
                  </span>
                </Link>
              ))}
            </nav>
          )}
        </aside>

        <section className="flex flex-col gap-4">
          {!chosen ? (
            <p className="rounded-lg border p-6 text-muted-foreground">
              Start a general practice set, or one for a job you've saved on your board. Writing the
              questions takes one AI call; each rating is another.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{label(chosen)}</h2>
                  <p className="text-sm text-muted-foreground">
                    {average === null
                      ? "Rate an answer to see how it lands."
                      : `Average ${average} across ${rated.length} rated answer${rated.length === 1 ? "" : "s"}.`}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Link
                    href={`/interview?set=${chosen.id}`}
                    className={byScore ? "text-muted-foreground hover:underline" : "font-medium"}
                  >
                    In order
                  </Link>
                  <span className="text-muted-foreground">·</span>
                  <Link
                    href={`/interview?set=${chosen.id}&sort=score`}
                    className={byScore ? "font-medium" : "text-muted-foreground hover:underline"}
                  >
                    Weakest first
                  </Link>
                  <form action={deleteSetAction}>
                    <input type="hidden" name="setId" value={chosen.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      Delete set
                    </Button>
                  </form>
                </div>
              </div>
              {chosen.state === "generating" && (
                <p className="text-sm text-muted-foreground">
                  Writing your questions… this takes under a minute.
                </p>
              )}
              {chosen.state === "failed" && (
                <p role="alert" className="text-sm text-destructive">
                  {chosen.failure}
                </p>
              )}
              {questions.map((q) => (
                <QuestionCard
                  key={q.id}
                  id={q.id}
                  number={chosen.questions.indexOf(q) + 1}
                  category={q.category}
                  question={q.question}
                  lookingFor={q.lookingFor}
                  answer={q.answer}
                  ratingState={q.ratingState}
                  score={q.score}
                  feedback={q.feedback}
                  stale={q.ratedAnswer !== null && q.ratedAnswer !== q.answer}
                  proposal={q.proposal}
                  proposalState={q.proposalState}
                  proposalParent={
                    q.proposal?.parentId ? (parentName.get(q.proposal.parentId) ?? null) : null
                  }
                />
              ))}
            </>
          )}
        </section>
      </main>
    </>
  );
}

export default function Page({ searchParams }: PageProps<"/interview">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Interview searchParams={searchParams} />
    </Suspense>
  );
}
