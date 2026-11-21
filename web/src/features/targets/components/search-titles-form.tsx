"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { approveTitlesAction, type FormState } from "@/features/targets/actions";

type Props = { targetId: string; titles: string[]; proposed: boolean };

/** The user edits the list (one per line) and approves it; only approved titles are searched. */
export function SearchTitlesForm({ targetId, titles, proposed }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(approveTitlesAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={targetId} />
      <Label htmlFor={`${targetId}-titles`}>
        {proposed ? "Suggested search titles: edit, then approve" : "Search titles (one per line)"}
      </Label>
      <Textarea
        id={`${targetId}-titles`}
        name="titles"
        rows={Math.max(3, titles.length + 1)}
        defaultValue={titles.join("\n")}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {proposed ? "Approve these titles" : "Save titles"}
        </Button>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
