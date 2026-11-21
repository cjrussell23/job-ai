"use client";

import { setStatusAction } from "@/features/applications/actions";

const labels = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
} as const;

type Props = { id: string; jobId: string; status: keyof typeof labels };

/** Moves an application to another status as soon as the member picks one. */
export function StatusSelect({ id, jobId, status }: Props) {
  return (
    <form action={setStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="jobId" value={jobId} />
      <label className="sr-only" htmlFor={`status-${id}`}>
        Status
      </label>
      <select
        id={`status-${id}`}
        name="status"
        defaultValue={status}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-8 rounded-md border bg-background px-2 text-sm"
      >
        {Object.entries(labels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </form>
  );
}
