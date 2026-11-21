"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { decideSuggestionAction, type ReviewFormState } from "@/features/profile/review-actions";

type Props = {
  id: string;
  jobId: string | null;
  label: string;
  itemTitle: string;
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
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {props.label}
        {props.itemTitle && ` · ${props.itemTitle}`}
      </p>
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
