"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  deleteSavedAnswerAction,
  type FormState,
  updateSavedAnswerAction,
} from "@/features/autofill/actions";

export function SavedAnswerRow({
  id,
  question,
  answer,
}: {
  id: string;
  question: string;
  answer: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateSavedAnswerAction, {});
  return (
    <li className="flex flex-col gap-2 rounded-md border p-3">
      <p className="text-sm font-medium">{question}</p>
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={id} />
        <textarea
          name="answer"
          defaultValue={answer}
          rows={Math.min(6, Math.max(1, Math.ceil(answer.length / 90)))}
          maxLength={3000}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Save
          </Button>
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            formAction={deleteSavedAnswerAction}
            className="text-muted-foreground"
          >
            Delete
          </Button>
          {state.message && <span className="text-xs text-muted-foreground">{state.message}</span>}
          {state.error && <span className="text-xs text-destructive">{state.error}</span>}
        </div>
      </form>
    </li>
  );
}
