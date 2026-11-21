import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { removeApplicationAction, trackJobAction } from "@/features/applications/actions";
import { applicationForJob, eventsFor, statusLabels } from "@/features/applications/applications";
import { approvedDocumentsForJob } from "@/features/documents/documents";
import { appTimeZone } from "@/features/runs/time";
import { ApplicationForm } from "./application-form";
import { StatusSelect } from "./status-select";

const day = (date: Date) =>
  date.toLocaleDateString("en-CA", { timeZone: appTimeZone, month: "short", day: "numeric" });

/** Tracking for one job on its page: start tracking, or change status, documents and notes. */
export async function ApplicationPanel({ userId, jobId }: { userId: string; jobId: string }) {
  const application = await applicationForJob(userId, jobId);
  if (!application) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Track this job</CardTitle>
          <CardDescription>
            Save it to your board, or mark it applied once you've sent your application yourself.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          {(["saved", "applied"] as const).map((status) => (
            <form key={status} action={trackJobAction}>
              <input type="hidden" name="jobId" value={jobId} />
              <input type="hidden" name="status" value={status} />
              <Button type="submit" variant={status === "saved" ? "default" : "outline"}>
                {status === "saved" ? "Save to board" : "I've applied"}
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>
    );
  }
  const [approved, events] = await Promise.all([
    approvedDocumentsForJob(userId, jobId),
    eventsFor(userId, [application.id]),
  ]);
  const option = (d: { id: string; version: number }) => ({
    id: d.id,
    label: `Version ${d.version}`,
  });
  const history = events.get(application.id) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">
          Your application
          <StatusSelect id={application.id} jobId={jobId} status={application.status} />
        </CardTitle>
        <CardDescription>
          {history.map((e) => `${statusLabels[e.status]} ${day(e.at)}`).join(" · ")} ·{" "}
          <Link href="/board" className="underline underline-offset-2">
            Board
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ApplicationForm
          id={application.id}
          jobId={jobId}
          resumeId={application.resumeId}
          coverLetterId={application.coverLetterId}
          notes={application.notes}
          resumes={approved.filter((d) => d.kind === "resume").map(option)}
          coverLetters={approved.filter((d) => d.kind === "cover_letter").map(option)}
        />
        <form action={removeApplicationAction}>
          <input type="hidden" name="id" value={application.id} />
          <input type="hidden" name="jobId" value={jobId} />
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
            Stop tracking (back to matches)
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
