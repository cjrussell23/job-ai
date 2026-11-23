"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { type FormState, saveStandardAnswersAction } from "@/features/autofill/actions";
import type { StandardAnswers } from "@/features/autofill/answers";

const yesNoValue = (v: boolean | null) => (v === true ? "yes" : v === false ? "no" : "");

/** The questions most forms ask, answered once. Blank leaves the question for the member. */
export function StandardAnswersForm({ answers }: { answers: StandardAnswers }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveStandardAnswersAction,
    {},
  );
  const yesNo = (name: keyof StandardAnswers, label: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        name={name}
        defaultValue={yesNoValue(answers[name] as boolean | null)}
        className="h-9 rounded-md border bg-background px-2"
      >
        <option value="">Leave for me</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
  const text = (name: keyof StandardAnswers, label: string, placeholder: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        defaultValue={String(answers[name] ?? "")}
        placeholder={placeholder}
        maxLength={100}
        className="h-9 rounded-md border bg-background px-2"
      />
    </label>
  );
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {yesNo("workAuthorized", "Legally able to work in Canada")}
        {yesNo("needsSponsorship", "Need visa sponsorship")}
        {yesNo("willingToRelocate", "Willing to relocate")}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {text("noticePeriod", "Notice period or start date", "Two weeks")}
        {text("salaryExpectation", "Salary expectation", "Blank leaves it for you")}
        {text("howHeard", "How did you hear about us", "Job board")}
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Self-identification</legend>
        <p className="text-xs text-muted-foreground">
          Voluntary questions. Blank answers "prefer not to say" or "decline to self-identify" when
          the form offers it.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {text("pronouns", "Pronouns", "Prefer not to say")}
          {text("gender", "Gender", "Prefer not to say")}
          {text("ethnicity", "Race or ethnicity", "Prefer not to say")}
          {text("veteran", "Veteran status", "Prefer not to say")}
          {text("disability", "Disability", "Prefer not to say")}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save answers"}
        </Button>
        {state.message && <span className="text-sm text-muted-foreground">{state.message}</span>}
        {state.error && <span className="text-sm text-destructive">{state.error}</span>}
      </div>
    </form>
  );
}
