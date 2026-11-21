import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BackupStatus } from "@/features/admin/backups";

const when = (date: Date) =>
  date.toLocaleString("en-CA", {
    timeZone: "America/Edmonton",
    dateStyle: "medium",
    timeStyle: "short",
  });

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function BackupCard({ status }: { status: BackupStatus }) {
  const { lastRun, lastSuccess, overdue } = status;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Backups
          {overdue ? (
            <Badge variant="destructive">Overdue</Badge>
          ) : (
            <Badge variant="outline">OK</Badge>
          )}
        </CardTitle>
        <CardDescription>
          A nightly encrypted database dump, kept for 30 days. See docs/backups.md to restore one.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        {lastSuccess ? (
          <p>
            Last good backup: {when(lastSuccess.finishedAt)} ({megabytes(lastSuccess.sizeBytes)},{" "}
            <span className="font-mono">{lastSuccess.filename}</span>)
          </p>
        ) : (
          <p>No backup has succeeded yet.</p>
        )}
        {lastRun && !lastRun.ok && (
          <p role="alert" className="text-destructive">
            The latest attempt failed at {when(lastRun.finishedAt)}: {lastRun.message}
          </p>
        )}
        {overdue && lastSuccess && (
          <p className="text-destructive">
            No backup has succeeded in the last day. Check the backup container.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
