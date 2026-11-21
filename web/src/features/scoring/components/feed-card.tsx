import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trackJobAction } from "@/features/applications/actions";
import { GradeButtons } from "@/features/feedback/components/grade-buttons";
import { JobDates } from "@/features/jobs/components/job-dates";
import { Pay } from "@/features/jobs/components/pay";
import { appTimeZone } from "@/features/runs/time";
import { dismissJobAction, splitPostingAction } from "@/features/scoring/actions";
import type { FeedItem } from "@/features/scoring/feed";
import type { MatchSummary as MatchSummaryRow } from "@/features/scoring/summaries";
import { sourceLabel } from "@/features/sources/catalogue";
import { MatchSummary } from "./match-summary";

const day = (date: Date) =>
  date.toLocaleDateString("en-CA", { timeZone: appTimeZone, month: "short", day: "numeric" });

function Score({
  label,
  value,
  reason,
}: {
  label: string;
  value: number | null;
  reason: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label} <span className="tabular-nums text-foreground">{value ?? "…"}</span>
      </p>
      <p className="text-sm">{reason ?? "Not scored yet."}</p>
    </div>
  );
}

const workplaceLabels = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: null,
} as const;

type CardProps = {
  item: FeedItem;
  grade: { kind: "up" | "down"; reason: string | null } | null;
  summary?: MatchSummaryRow;
};

export function FeedCard({ item, grade, summary }: CardProps) {
  const { job, best, otherTargets } = item;
  const workplace = workplaceLabels[job.remote];
  return (
    <article className="flex flex-col gap-4 rounded-lg border p-4">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="font-semibold">{job.title}</h2>
          <p className="text-sm text-muted-foreground">
            {job.company}
            {job.location && ` · ${job.location}`}
            {workplace && ` · ${workplace}`}
          </p>
          <p className="text-sm">
            <Pay job={job} />
          </p>
          <JobDates job={job} />
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-2xl font-semibold tabular-nums">{best.combined ?? "…"}</span>
          <span className="text-xs text-muted-foreground">match</span>
        </div>
      </header>

      {summary && (
        <MatchSummary
          id={summary.id}
          jobId={job.id}
          headline={summary.headline}
          points={summary.points}
          rating={summary.rating}
          reason={summary.ratingReason}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Score label="Target fit" value={best.targetFit} reason={best.targetFitReason} />
        <Score label="Profile fit" value={best.profileFit} reason={best.profileFitReason} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">{best.targetName}</Badge>
        {otherTargets.map((name) => (
          <Badge key={name} variant="outline">
            also {name}
          </Badge>
        ))}
        {best.unknownFields.map((field) => (
          <Badge key={field} variant="outline">
            {field === "pay" ? "Pay not stated" : "Location not stated"}
          </Badge>
        ))}
      </div>

      <ul className="flex flex-col gap-1 text-sm">
        {job.postings.map((posting) => (
          <li key={posting.id} className="flex flex-wrap items-center gap-2">
            <a
              href={posting.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2"
            >
              {sourceLabel(posting.source)}
              <ExternalLink className="size-3" />
            </a>
            {posting.missingRuns > 0 ? (
              <Badge variant="destructive">Missing · last seen {day(posting.lastSeenAt)}</Badge>
            ) : (
              <span className="text-muted-foreground">last seen {day(posting.lastSeenAt)}</span>
            )}
            {job.postings.length > 1 && (
              <form action={splitPostingAction}>
                <input type="hidden" name="postingId" value={posting.id} />
                <Button
                  type="submit"
                  variant="link"
                  size="sm"
                  className="h-auto px-0 text-muted-foreground"
                >
                  Not the same job
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <footer className="flex items-center justify-between gap-3">
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Description</summary>
          <p className="mt-2 max-h-96 overflow-y-auto whitespace-pre-line">
            {job.description || "No description."}
          </p>
        </details>
        <div className="flex items-center gap-2">
          <Link
            href={`/jobs/${job.id}`}
            className="text-sm font-medium underline underline-offset-2"
          >
            Tailor
          </Link>
          <GradeButtons
            jobId={job.id}
            targetId={best.targetId}
            grade={grade?.kind ?? null}
            reason={grade?.reason ?? null}
          />
          <form action={trackJobAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="targetId" value={best.targetId} />
            <input type="hidden" name="status" value="saved" />
            <Button type="submit" variant="outline" size="sm">
              Save
            </Button>
          </form>
          <form action={dismissJobAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="targetId" value={best.targetId} />
            <Button type="submit" variant="ghost" size="sm">
              Dismiss
            </Button>
          </form>
        </div>
      </footer>
    </article>
  );
}
