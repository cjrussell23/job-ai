"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addPreferenceAction,
  deletePreferenceAction,
  type FormState,
  togglePreferenceAction,
} from "@/features/feedback/actions";
import type { LearnedPreference } from "@/features/feedback/feedback";

/** What the app has learned from a member's ratings, which they can switch off, delete or add to. */
export function PreferencesCard({ preferences }: { preferences: LearnedPreference[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addPreferenceAction, {});
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">What we've learned about your preferences</h2>
        <p className="text-sm text-muted-foreground">
          Learned from your thumbs up and down after each morning's run, and used when scoring
          target fit. Switch off or delete anything that's wrong, or add your own.
        </p>
      </div>
      {preferences.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing yet. Rate a few matches and preferences appear after the next run.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {preferences.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className={p.active ? "flex-1" : "flex-1 text-muted-foreground line-through"}>
                {p.statement}
              </span>
              <Badge variant="outline">{p.origin === "member" ? "Yours" : "Learned"}</Badge>
              <form action={togglePreferenceAction}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="active" value={String(!p.active)} />
                <Button type="submit" variant="ghost" size="sm">
                  {p.active ? "Switch off" : "Switch on"}
                </Button>
              </form>
              <form action={deletePreferenceAction}>
                <input type="hidden" name="id" value={p.id} />
                <Button type="submit" variant="ghost" size="sm">
                  Delete
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="flex flex-wrap gap-2">
        <Input
          name="statement"
          required
          placeholder="e.g. Avoid staffing agencies"
          className="max-w-md"
          aria-label="Add a preference"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          Add
        </Button>
        {state.error && (
          <p role="alert" className="w-full text-sm text-destructive">
            {state.error}
          </p>
        )}
      </form>
    </section>
  );
}
