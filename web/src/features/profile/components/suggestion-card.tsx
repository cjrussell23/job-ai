"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { decideSuggestionAction, type ReviewFormState } from "@/features/profile/review-actions";

type Props = {
  id: string;
  jobId: string | null;
  label: string;
  itemContext: string;
  /** The job a job-wording edit was written for, when shown away from that job. */
  forJob: { id: string; label: string } | null;
  originalText: string;
  proposedText: string;
  reason: string;
};

/** One accept-or-reject edit against a profile item. */
export function SuggestionCard(props: Props) {
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(
    decideSuggestionAction,
    {},
  );
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {props.label}
        </p>
        {props.itemContext && <p className="font-medium">{props.itemContext}</p>}
        {props.forJob && (
          <p className="text-xs text-muted-foreground">
            For{" "}
            <Link href={`/jobs/${props.forJob.id}`} className="underline underline-offset-2">
              {props.forJob.label}
            </Link>
          </p>
        )}
      </div>
      <p className="text-muted-foreground line-through decoration-muted-foreground/50">
        {props.originalText}
      </p>
      <p>{props.proposedText}</p>
      <p className="text-xs text-muted-foreground">{props.reason}</p>
      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="id" value={props.id} />
        {props.jobId && <input type="hidden" name="jobId" value={props.jobId} />}
        <Button type="submit" name="decision" value="accept" size="sm" disabled={pending}>
          Accept
        </Button>
        <Button
          type="submit"
          name="decision"
          value="reject"
          size="sm"
          variant="ghost"
          disabled={pending}
        >
          Reject
        </Button>
        {state.error && (
          <span role="alert" className="text-destructive">
            {state.error}
          </span>
        )}
      </form>
    </li>
  );
}
