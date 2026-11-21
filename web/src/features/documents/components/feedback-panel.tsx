import { RefreshWhile } from "@/components/refresh-while";
import { Button } from "@/components/ui/button";
import type { ResumeFeedback } from "@/features/documents/feedback";
import { startFeedbackAction } from "@/features/documents/standing-actions";

const aspectLabels: Record<string, string> = {
  impact: "Impact",
  wording: "Wording",
  relevance: "Relevance",
  structure: "Structure",
  length: "Length",
  skills: "Skills",
  summary: "Summary",
};

type Props = { version: number; feedback: ResumeFeedback | null };

/** AI feedback on the saved resume. Each request is one model call, made only on request. */
export function FeedbackPanel({ version, feedback }: Props) {
  const running = feedback?.state === "running";
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
      <RefreshWhile active={running} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">AI feedback</span>
        {/* Rendered inside the builder's form, which already carries this resume's id. */}
        <Button
          type="submit"
          formAction={startFeedbackAction}
          formNoValidate
          size="sm"
          variant="outline"
          disabled={running}
        >
          {running ? "Reviewing…" : feedback?.state === "done" ? "Ask again" : "Get AI feedback"}
        </Button>
      </div>
      {!feedback && (
        <p className="text-xs text-muted-foreground">
          A recruiter's-eye read of the saved resume, with specific changes. Uses one AI call.
        </p>
      )}
      {feedback?.state === "failed" && (
        <p role="alert" className="text-destructive">
          {feedback.failure}
        </p>
      )}
      {feedback?.state === "done" && (
        <>
          {feedback.version !== version && (
            <p className="text-xs text-muted-foreground">
              Written before your last save; ask again for the current version.
            </p>
          )}
          <p>{feedback.overall}</p>
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            {feedback.suggestions.map((s) => (
              <li key={`${s.aspect}-${s.advice}`}>
                <span className="mr-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                  {aspectLabels[s.aspect] ?? s.aspect}
                </span>
                {s.advice}
                {s.quote && (
                  <span className="mt-1 block border-l-2 pl-2 text-xs text-muted-foreground">
                    {s.quote}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            Change wording on your profile, then save this resume again.
          </p>
        </>
      )}
    </div>
  );
}
