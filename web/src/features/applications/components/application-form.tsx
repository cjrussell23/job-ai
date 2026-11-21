"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { type AttachState, attachDocumentsAction } from "@/features/applications/actions";

type Option = { id: string; label: string };

type Props = {
  id: string;
  jobId: string;
  resumeId: string | null;
  coverLetterId: string | null;
  notes: string;
  resumes: Option[];
  coverLetters: Option[];
};

/** Which approved documents went with this application, plus the member's notes. */
export function ApplicationForm(props: Props) {
  const [state, action, pending] = useActionState<AttachState, FormData>(attachDocumentsAction, {});
  const select = (name: string, value: string | null, options: Option[], label: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="h-9 rounded-md border bg-background px-2"
      >
        <option value="">None</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {options.length === 0 && (
        <span className="text-xs text-muted-foreground">No approved version yet.</span>
      )}
    </label>
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={props.id} />
      <input type="hidden" name="jobId" value={props.jobId} />
      <div className="grid gap-3 sm:grid-cols-2">
        {select("resume", props.resumeId, props.resumes, "Resume used")}
        {select("cover_letter", props.coverLetterId, props.coverLetters, "Cover letter used")}
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Notes</span>
        <textarea
          name="notes"
          defaultValue={props.notes}
          rows={3}
          maxLength={5000}
          className="rounded-md border bg-background p-2"
          placeholder="Contacts, interview dates, follow-ups…"
        />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
      </div>
    </form>
  );
}
