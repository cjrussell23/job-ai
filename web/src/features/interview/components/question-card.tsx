"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AnswerFeedback, ProposedItem } from "@/db/schema";
import { type AnswerState, answerAction, decideProposalAction } from "@/features/interview/actions";

const categoryLabels = {
  behavioural: "Behavioural",
  technical: "Technical",
  project: "Your work",
  motivation: "Motivation",
  job: "This job",
} as const;

type Props = {
  id: string;
  number: number;
  category: keyof typeof categoryLabels;
  question: string;
  lookingFor: string;
  answer: string;
  ratingState: "none" | "rating" | "rated" | "failed";
  score: number | null;
  feedback: AnswerFeedback | null;
  stale: boolean;
  proposal: ProposedItem | null;
  proposalState: "open" | "accepted" | "rejected" | null;
  /** For a proposed bullet, the role or project it would go under. */
  proposalParent: string | null;
};

const tone = (score: number) =>
  score >= 85
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
    : score >= 70
      ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
      : score >= 50
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300";

/** One practice question: write and save an answer, get it rated, and use what's new in it. */
export function QuestionCard(props: Props) {
  const [state, action, pending] = useActionState<AnswerState, FormData>(answerAction, {});
  return (
    <article className="flex flex-col gap-3 rounded-lg border p-4">
      <header className="flex items-start gap-3">
        <span className="mt-0.5 text-sm text-muted-foreground tabular-nums">{props.number}.</span>
        <div className="flex flex-1 flex-col gap-1">
          <p className="font-medium">{props.question}</p>
          {props.lookingFor && (
            <p className="text-xs text-muted-foreground">They're looking for: {props.lookingFor}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant="outline">{categoryLabels[props.category]}</Badge>
          {props.score !== null && (
            <span
              className={`rounded px-2 py-0.5 text-sm font-semibold tabular-nums ${tone(props.score)}`}
            >
              {props.score}
            </span>
          )}
        </div>
      </header>

      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="questionId" value={props.id} />
        <Textarea
          name="answer"
          defaultValue={props.answer}
          rows={5}
          maxLength={6000}
          placeholder="Write your answer as you'd say it. For a 'tell me about a time' question: the situation, what you did, and the result."
          aria-label={`Answer to question ${props.number}`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            name="intent"
            value="save"
            size="sm"
            variant="outline"
            disabled={pending}
          >
            Save
          </Button>
          <Button
            type="submit"
            name="intent"
            value="rate"
            size="sm"
            disabled={pending || props.ratingState === "rating"}
          >
            {props.ratingState === "rating"
              ? "Rating…"
              : props.score === null
                ? "Save and rate"
                : "Save and rate again"}
          </Button>
          {state.error && (
            <span role="alert" className="text-sm text-destructive">
              {state.error}
            </span>
          )}
          {state.message && <span className="text-sm text-muted-foreground">{state.message}</span>}
          {props.ratingState === "failed" && (
            <span className="text-sm text-destructive">The rating failed. Try again.</span>
          )}
        </div>
      </form>

      {props.feedback && (
        <section className="flex flex-col gap-2 rounded-md bg-muted/50 p-3 text-sm">
          {props.stale && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              You've changed the answer since this rating. Rate it again to update.
            </p>
          )}
          <p>{props.feedback.summary}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {props.feedback.strengths.length > 0 && (
              <div>
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Strong</p>
                <ul className="list-disc pl-4">
                  {props.feedback.strengths.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {props.feedback.improvements.length > 0 && (
              <div>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Make it stronger
                </p>
                <ul className="list-disc pl-4">
                  {props.feedback.improvements.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {props.proposal && props.proposalState === "open" && (
        <section className="flex flex-col gap-2 rounded-md border border-dashed p-3 text-sm">
          <p className="text-xs font-medium text-muted-foreground">
            Your answer has something your profile doesn't. Add it as{" "}
            {props.proposal.type === "story"
              ? "a story"
              : `a bullet under ${props.proposalParent ?? "one of your roles"}`}
            ?
          </p>
          {props.proposal.title && <p className="font-medium">{props.proposal.title}</p>}
          <p className="whitespace-pre-line">{props.proposal.content}</p>
          <form action={decideProposalAction} className="flex gap-2">
            <input type="hidden" name="questionId" value={props.id} />
            <Button type="submit" name="decision" value="accept" size="sm">
              Add to my profile
            </Button>
            <Button type="submit" name="decision" value="reject" size="sm" variant="ghost">
              No thanks
            </Button>
          </form>
        </section>
      )}
      {props.proposalState === "accepted" && (
        <p className="text-xs text-muted-foreground">Added to your profile from this answer.</p>
      )}
    </article>
  );
}
