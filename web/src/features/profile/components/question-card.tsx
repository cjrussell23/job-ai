"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { answerQuestionAction, type ReviewFormState } from "@/features/profile/review-actions";

type Props = { id: string; jobId: string | null; question: string; context: string | null };

/** One skippable question. A yes asks for a concrete example before anything is saved. */
export function QuestionCard({ id, jobId, question, context }: Props) {
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(
    answerQuestionAction,
    {},
  );
  const [saidYes, setSaidYes] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="id" value={id} />
      {jobId && <input type="hidden" name="jobId" value={jobId} />}
      <p className="font-medium">{question}</p>
      {context && <p className="text-xs text-muted-foreground">{context}</p>}
      {saidYes ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span>
              Give one concrete example: what you did, where, and the result if you know it.
            </span>
            <textarea
              name="example"
              rows={3}
              maxLength={2000}
              required
              minLength={10}
              className="rounded-md border bg-background p-2"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" name="answer" value="yes" size="sm" disabled={pending}>
              Add to my profile
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSaidYes(false)}>
              Back
            </Button>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => setSaidYes(true)}>
            Yes
          </Button>
          <Button
            type="submit"
            name="answer"
            value="no"
            size="sm"
            variant="outline"
            disabled={pending}
          >
            No
          </Button>
          <Button
            type="submit"
            name="answer"
            value="skip"
            size="sm"
            variant="ghost"
            disabled={pending}
          >
            Skip
          </Button>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
