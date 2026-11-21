"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { type RescoreState, rescoreAction } from "@/features/scoring/actions";
import type { RescoreStatus } from "@/features/scoring/rescore";

/** Shown only when the profile or a target changed after some live matches were scored. */
export function RescoreBanner({ status }: { status: RescoreStatus }) {
  const [state, action, pending] = useActionState<RescoreState>(rescoreAction, {});
  const stale = status.staleProfile + status.staleTarget;
  if (stale === 0 && !status.running && !state.message) return null;

  const what =
    status.staleProfile > 0 && status.staleTarget > 0
      ? "your profile and job targets"
      : status.staleProfile > 0
        ? "your profile"
        : "your job targets";
  const left = Math.max(0, status.limitPerDay - status.usedToday);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4 text-sm">
      <p className="flex-1">
        {status.running
          ? "Rescoring your jobs…"
          : `You changed ${what} since ${stale === 1 ? "1 match was" : `${stale} matches were`} scored.`}
      </p>
      {!status.running && stale > 0 && (
        <form action={action} className="flex items-center gap-3">
          <span className="text-muted-foreground">
            {left === 0 ? "No rescores left today" : `${left} left today`}
          </span>
          <Button type="submit" size="sm" disabled={pending || left === 0}>
            Rescore my jobs
          </Button>
        </form>
      )}
      {state.message && <p className="w-full text-muted-foreground">{state.message}</p>}
      {state.error && (
        <p role="alert" className="w-full text-destructive">
          {state.error}
        </p>
      )}
    </div>
  );
}
