"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type FormState, saveTargetAction } from "@/features/targets/actions";
import type { JobTarget } from "@/features/targets/targets";

type Props = { target?: JobTarget; onDone?: () => void };

const selectClass = "h-9 rounded-md border bg-transparent px-2 text-sm";

function Check({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4" />
      {label}
    </label>
  );
}

export function TargetForm({ target, onDone }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveTargetAction, {});
  const id = target?.id ?? "new";

  useEffect(() => {
    if (state.message) onDone?.();
  }, [state, onDone]);

  return (
    <form action={action} className="flex flex-col gap-4">
      {target && <input type="hidden" name="id" value={target.id} />}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-role`}>What kind of job?</Label>
        <Input
          id={`${id}-role`}
          name="roleType"
          required
          placeholder="e.g. Backend software engineer, Mental health counsellor, Barista"
          defaultValue={target?.roleType}
        />
      </div>

      <fieldset className="flex flex-col gap-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Location</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-locations`}>Locations (comma separated)</Label>
            <Input
              id={`${id}-locations`}
              name="locations"
              placeholder="Calgary, AB"
              defaultValue={target?.locations.join(", ") ?? "Calgary, AB"}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-workplace`}>Remote work</Label>
            <select
              id={`${id}-workplace`}
              name="workplace"
              defaultValue={target?.workplace ?? "local_or_remote"}
              className={selectClass}
            >
              <option value="local_or_remote">In these locations, or remote</option>
              <option value="local_only">Only in these locations</option>
              <option value="remote_only">Remote only</option>
            </select>
          </div>
        </div>
        <Check
          name="locationIsFirm"
          label="Firm limit: never show jobs outside this"
          defaultChecked={target?.locationIsFirm}
        />
        <Check
          name="hideUnknownLocation"
          label="With a firm limit, also hide jobs that don't say where they are"
          defaultChecked={target?.hideUnknownLocation}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Pay</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-pay`}>Minimum ($)</Label>
            <Input
              id={`${id}-pay`}
              name="minPay"
              type="number"
              min="0"
              step="0.01"
              placeholder="Optional"
              defaultValue={target?.minPayCents == null ? "" : target.minPayCents / 100}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-basis`}>Per</Label>
            <select
              id={`${id}-basis`}
              name="payBasis"
              defaultValue={target?.payBasis ?? "annual"}
              className={selectClass}
            >
              <option value="annual">Year (salary)</option>
              <option value="hourly">Hour</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-hours`}>Hours a week you want</Label>
            <Input
              id={`${id}-hours`}
              name="desiredHours"
              type="number"
              min="1"
              max="80"
              placeholder="40"
              defaultValue={target?.desiredHours ?? ""}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Hourly and yearly pay are compared using your hours a week (40 if blank).
        </p>
        <Check
          name="payIsFirm"
          label="Firm limit: never show jobs paying less"
          defaultChecked={target?.payIsFirm}
        />
        <Check
          name="hideUnknownPay"
          label="With a firm limit, also hide jobs that don't list pay"
          defaultChecked={target?.hideUnknownPay}
        />
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-note`}>Anything else? (trade-offs, must-haves)</Label>
        <Textarea
          id={`${id}-note`}
          name="note"
          rows={3}
          placeholder="e.g. I'd take less pay for a strong mentorship culture. No night shifts."
          defaultValue={target?.note}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {target ? "Save job target" : "Add job target"}
        </Button>
        {target && onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
