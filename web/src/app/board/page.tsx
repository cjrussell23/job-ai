import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import {
  type Application,
  type ApplicationEvent,
  eventsFor,
  listApplications,
  statuses,
  statusLabels,
} from "@/features/applications/applications";
import { StatusSelect } from "@/features/applications/components/status-select";
import { type Document, documentsByIds } from "@/features/documents/documents";
import { type JobWithPostings, jobsWithPostings } from "@/features/jobs/jobs";
import { requireMember } from "@/features/members/session";
import { appTimeZone } from "@/features/runs/time";
import { type BestMatch, bestMatchesForJobs } from "@/features/scoring/feed";
import { sourceLabel } from "@/features/sources/catalogue";

const day = (date: Date) =>
  date.toLocaleDateString("en-CA", { timeZone: appTimeZone, month: "short", day: "numeric" });

function DocumentLink({ doc, label }: { doc: Document | undefined; label: string }) {
  if (!doc) return <span className="text-muted-foreground">No {label.toLowerCase()}</span>;
  return (
    <a href={`/documents/${doc.id}/pdf`} target="_blank" rel="noreferrer" className="underline">
      {label} v{doc.version}
      {/* Editing an approved document returns it to draft; flag that the sent version changed. */}
      {doc.state !== "approved" && " (edited since approval)"}
    </a>
  );
}

type CardProps = {
  application: Application;
  job: JobWithPostings;
  match: BestMatch | undefined;
  history: ApplicationEvent[];
  docs: Map<string, Document>;
};

function ApplicationCard({ application, job, match, history, docs }: CardProps) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/jobs/${job.id}`} className="font-medium underline-offset-2 hover:underline">
            {job.title}
          </Link>
          <p className="text-muted-foreground">
            {job.company}
            {job.location && ` · ${job.location}`}
          </p>
        </div>
        {match?.combined != null && (
          <span className="text-lg font-semibold tabular-nums">{match.combined}</span>
        )}
      </div>
      {match && (
        <p className="text-xs text-muted-foreground">
          Target fit {match.targetFit ?? "…"} · Profile fit {match.profileFit ?? "…"} ·{" "}
          {match.targetName}
        </p>
      )}
      <div className="flex flex-wrap gap-2 text-xs">
        {job.postings.map((p) => (
          <a
            key={p.id}
            href={p.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-2"
          >
            {sourceLabel(p.source)} <ExternalLink className="size-3" />
          </a>
        ))}
        {job.state !== "open" && <Badge variant="outline">Posting closed</Badge>}
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        <DocumentLink
          doc={application.resumeId ? docs.get(application.resumeId) : undefined}
          label="Resume"
        />
        <DocumentLink
          doc={application.coverLetterId ? docs.get(application.coverLetterId) : undefined}
          label="Cover letter"
        />
      </div>
      {application.notes && (
        <p className="line-clamp-3 whitespace-pre-line text-xs">{application.notes}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {history.map((e) => `${statusLabels[e.status]} ${day(e.at)}`).join(" · ")}
        </p>
        <StatusSelect id={application.id} jobId={job.id} status={application.status} />
      </div>
    </li>
  );
}

async function Board() {
  const { userId, name, member } = await requireMember();
  const applications = await listApplications(userId);
  const jobIds = applications.map((a) => a.jobId);
  const docIds = applications.flatMap((a) =>
    [a.resumeId, a.coverLetterId].filter((id): id is string => id !== null),
  );
  const [jobs, matches, events, docs] = await Promise.all([
    jobsWithPostings(jobIds),
    bestMatchesForJobs(userId, jobIds, member.targetFitWeight),
    eventsFor(
      userId,
      applications.map((a) => a.id),
    ),
    documentsByIds(userId, docIds),
  ]);
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  return (
    <>
      <SiteHeader name={name} isAdmin={member.role === "admin"} />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
          <p className="text-muted-foreground">
            Jobs you've saved or applied to. Save a job from your matches to start tracking it.
          </p>
        </div>
        {applications.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing tracked yet.{" "}
            <Link href="/" className="underline">
              Go to your matches
            </Link>
            .
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            {statuses.map((status) => {
              const column = applications.filter((a) => a.status === status);
              return (
                <section key={status} className="flex flex-col gap-2">
                  <h2 className="text-sm font-medium">
                    {statusLabels[status]}{" "}
                    <span className="text-muted-foreground tabular-nums">{column.length}</span>
                  </h2>
                  <ul className="flex flex-col gap-2">
                    {column.map((application) => {
                      const job = jobById.get(application.jobId);
                      return job ? (
                        <ApplicationCard
                          key={application.id}
                          application={application}
                          job={job}
                          match={matches.get(job.id)}
                          history={events.get(application.id) ?? []}
                          docs={docs}
                        />
                      ) : null;
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Board />
    </Suspense>
  );
}
