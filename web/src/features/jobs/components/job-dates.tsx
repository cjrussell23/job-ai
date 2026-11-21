import { type JobWithPostings, postedAt } from "@/features/jobs/jobs";
import { appTimeZone } from "@/features/runs/time";

const dayFormat = (date: Date, now: Date) =>
  date.toLocaleDateString("en-CA", {
    timeZone: appTimeZone,
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });

function ago(date: Date, now: Date): string {
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** When the job was posted (if a posting says) and when the app first found it. */
export function JobDates({ job }: { job: JobWithPostings }) {
  const now = new Date();
  const posted = postedAt(job);
  return (
    <p className="text-xs text-muted-foreground">
      {posted ? (
        <span title={dayFormat(posted, now)}>Posted {ago(posted, now)}</span>
      ) : (
        <span>Posting date not given</span>
      )}
      {" · "}
      <span title={dayFormat(job.firstSeenAt, now)}>First seen {ago(job.firstSeenAt, now)}</span>
    </p>
  );
}
