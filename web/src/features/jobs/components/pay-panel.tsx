"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearPayAction,
  confirmEstimateAction,
  enterPayAction,
  type PayFormState,
} from "@/features/jobs/member-pay-actions";

type Props = {
  jobId: string;
  hasEstimate: boolean;
  /** How the member's own figure was recorded, if they have one. */
  memberPay: "entered" | "confirmed_estimate" | null;
  /** The posting states pay, so entering it is only for correcting it. */
  stated: boolean;
};

/** Lets a member record pay they know for a job, or confirm the estimate. Private to them. */
export function PayPanel({ jobId, hasEstimate, memberPay, stated }: Props) {
  const [state, action, pending] = useActionState<PayFormState, FormData>(enterPayAction, {});
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {hasEstimate && !stated && !memberPay && (
          <form action={confirmEstimateAction}>
            <input type="hidden" name="jobId" value={jobId} />
            <Button type="submit" size="sm" variant="outline">
              The estimate is right
            </Button>
          </form>
        )}
        {memberPay && (
          <form action={clearPayAction}>
            <input type="hidden" name="jobId" value={jobId} />
            <Button type="submit" size="sm" variant="ghost">
              Remove my figure
            </Button>
          </form>
        )}
      </div>
      <details>
        <summary className="cursor-pointer text-muted-foreground">
          {memberPay
            ? "Change the pay you know"
            : stated
              ? "Know different pay?"
              : "I know the pay"}
        </summary>
        <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="jobId" value={jobId} />
          <div className="flex flex-col gap-1">
            <label htmlFor={`pay-min-${jobId}`} className="text-xs text-muted-foreground">
              From
            </label>
            <Input
              id={`pay-min-${jobId}`}
              name="payMin"
              inputMode="decimal"
              required
              className="w-32"
              placeholder="e.g. 95,000"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`pay-max-${jobId}`} className="text-xs text-muted-foreground">
              To (optional)
            </label>
            <Input
              id={`pay-max-${jobId}`}
              name="payMax"
              inputMode="decimal"
              className="w-32"
              placeholder="e.g. 110,000"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`pay-period-${jobId}`} className="text-xs text-muted-foreground">
              Per
            </label>
            <select
              id={`pay-period-${jobId}`}
              name="payPeriod"
              defaultValue="year"
              className="h-9 rounded-md border bg-background px-2"
            >
              <option value="year">year</option>
              <option value="month">month</option>
              <option value="week">week</option>
              <option value="day">day</option>
              <option value="hour">hour</option>
            </select>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            Save
          </Button>
        </form>
      </details>
      <p className="text-xs text-muted-foreground">
        Only you see pay you record. It counts as known pay for your pay limits and scoring.
      </p>
      {state.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
      {state.message && <p className="text-muted-foreground">{state.message}</p>}
    </div>
  );
}
