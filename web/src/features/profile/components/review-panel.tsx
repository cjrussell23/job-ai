import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { jobsWithPostings } from "@/features/jobs/jobs";
import {
  nextQuestion,
  openQuestionCount,
  type ProfileQuestion,
  skillGaps,
} from "@/features/profile/questions";
import { latestReview } from "@/features/profile/review";
import { reopenQuestionAction, startReviewAction } from "@/features/profile/review-actions";
import { openSuggestions, suggestionKindLabels } from "@/features/profile/suggestions";
import { QuestionCard } from "./question-card";
import { RefreshWhile } from "./refresh-while";
import { SuggestionCard } from "./suggestion-card";

function questionContext(q: ProfileQuestion): string | null {
  if (q.trigger === "recurring_requirement") return `Mentioned in ${q.jobCount} of your matches.`;
  if (q.trigger === "job") return "Asked because this job mentions it.";
  return null;
}

type Props = { userId: string; jobId: string | null };

/**
 * Suggestions and questions, general (profile page) or for one job (job page).
 * Reviews run only when the member asks, since each is a model call.
 */
export async function ReviewPanel({ userId, jobId }: Props) {
  const [review, question, remaining, ideas, gaps] = await Promise.all([
    latestReview(userId, jobId),
    nextQuestion(userId, jobId ?? undefined),
    openQuestionCount(userId),
    openSuggestions(userId, jobId ?? undefined),
    jobId ? Promise.resolve([]) : skillGaps(userId),
  ]);
  // On the profile page a job-wording edit names the job it was written for.
  const forJobs = jobId
    ? []
    : await jobsWithPostings([...new Set(ideas.flatMap((s) => (s.jobId ? [s.jobId] : [])))]);
  const jobLabel = new Map(forJobs.map((j) => [j.id, `${j.title} at ${j.company}`]));
  const running = review?.state === "running";
  return (
    <Card>
      <RefreshWhile active={running} />
      <CardHeader>
        <CardTitle>{jobId ? "Your profile for this job" : "Strengthen your profile"}</CardTitle>
        <CardDescription>
          {jobId
            ? "Checks your profile against this job: wording you could use and requirements your profile doesn't show yet."
            : "Finds vague or long items and asks about experience your matches want that your profile doesn't show. Nothing changes until you accept it."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action={startReviewAction} className="flex flex-wrap items-center gap-3">
          {jobId && <input type="hidden" name="jobId" value={jobId} />}
          <Button type="submit" variant="outline" size="sm" disabled={running}>
            {running
              ? "Reviewing…"
              : jobId
                ? "Check my profile against this job"
                : "Review my profile"}
          </Button>
          {review?.state === "failed" && (
            <span role="alert" className="text-sm text-destructive">
              {review.failure}
            </span>
          )}
          {review?.state === "done" && !question && ideas.length === 0 && (
            <span className="text-sm text-muted-foreground">Nothing new to suggest right now.</span>
          )}
        </form>

        {question && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">
              A question{" "}
              {!jobId && remaining > 1 && (
                <span className="font-normal text-muted-foreground">
                  ({remaining - 1} more after this)
                </span>
              )}
            </h3>
            <QuestionCard
              key={question.id}
              id={question.id}
              jobId={jobId}
              question={question.question}
              context={questionContext(question)}
            />
          </section>
        )}

        {ideas.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Suggested edits</h3>
            <ul className="flex flex-col gap-2">
              {ideas.map((s) => (
                <SuggestionCard
                  key={s.id}
                  id={s.id}
                  jobId={jobId}
                  label={suggestionKindLabels[s.kind]}
                  itemContext={s.itemContext}
                  forJob={
                    s.jobId && jobLabel.has(s.jobId)
                      ? { id: s.jobId, label: jobLabel.get(s.jobId) ?? "" }
                      : null
                  }
                  originalText={s.originalText}
                  proposedText={s.proposedText}
                  reason={s.reason}
                />
              ))}
            </ul>
          </section>
        )}

        {gaps.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Worth learning</h3>
            <p className="text-xs text-muted-foreground">
              Things your matches ask for that you said you haven't done. Your documents never claim
              them.
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {gaps.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{g.topic}</span>
                  {g.jobCount > 0 && (
                    <span className="text-muted-foreground">in {g.jobCount} matches</span>
                  )}
                  <form action={reopenQuestionAction}>
                    <input type="hidden" name="id" value={g.id} />
                    <Button type="submit" variant="link" size="sm" className="h-auto px-0">
                      I have now
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
