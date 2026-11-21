import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DailyRun, ScrapeRun } from "@/db/schema";
import type { RunSummary } from "@/features/runs/daily-run";
import { appTimeZone } from "@/features/runs/time";
import { sourceLabel } from "@/features/sources/catalogue";
import { RunControls } from "./run-controls";

const when = (date: Date) =>
  date.toLocaleString("en-CA", { timeZone: appTimeZone, dateStyle: "medium", timeStyle: "short" });

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Props = { runs: DailyRun[]; latestSearches: ScrapeRun[]; dailyRunTime: string };

export function RunsCard({ runs, latestSearches, dailyRunTime }: Props) {
  const latest = runs[0];
  const summary = latest?.status === "done" ? (latest.summary as RunSummary) : null;
  const failures = latestSearches.filter((s) => s.error && !s.error.includes("failed validation"));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily runs</CardTitle>
        <CardDescription>
          Every active job target's approved titles are searched on every enabled source once a day.
          A source that fails is skipped and its jobs are not marked missing.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <RunControls dailyRunTime={dailyRunTime} />
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {runs.map((run) => (
              <li key={run.id} className="flex items-center gap-2">
                <span>{when(run.startedAt)}</span>
                <Badge variant={run.status === "failed" ? "destructive" : "outline"}>
                  {run.status === "running" ? "Running" : run.status === "done" ? "Done" : "Failed"}
                </Badge>
                {run.trigger === "manual" && <span className="text-muted-foreground">manual</span>}
                {run.status === "done" && (
                  <span className="text-muted-foreground">
                    {(run.summary as RunSummary).newJobs} new jobs from{" "}
                    {(run.summary as RunSummary).queries} searches
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {summary && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Searches</TableHead>
                <TableHead className="text-right">Found</TableHead>
                <TableHead className="text-right">New</TableHead>
                <TableHead className="text-right">Missing</TableHead>
                <TableHead className="text-right">Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(summary.sources).map(([id, totals]) => (
                <TableRow key={id}>
                  <TableCell>{sourceLabel(id)}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.searches}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.found}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.newPostings}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.missing}</TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${totals.errors ? "text-destructive" : ""}`}
                  >
                    {totals.errors}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {failures.length > 0 && (
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-medium text-destructive">Failed searches in the latest run</p>
            {failures.slice(0, 10).map((f) => (
              <p key={f.id} className="text-muted-foreground">
                {sourceLabel(f.source)} · {f.query}
                {f.location && ` (${f.location})`}: {f.error}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
