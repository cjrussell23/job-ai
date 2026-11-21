"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarketNote } from "@/features/scoring/components/market-note";
import type { MarketView } from "@/features/scoring/market";
import {
  deleteTargetAction,
  setActiveAction,
  suggestTitlesAction,
} from "@/features/targets/actions";
import type { JobTarget } from "@/features/targets/targets";
import { SearchTitlesForm } from "./search-titles-form";
import { TargetForm } from "./target-form";

const workplaceLabels: Record<JobTarget["workplace"], string> = {
  local_or_remote: "or remote",
  local_only: "only",
  remote_only: "Remote only",
};

function payText(target: JobTarget): string | null {
  if (target.minPayCents === null) return null;
  const amount = (target.minPayCents / 100).toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: target.payBasis === "hourly" ? 2 : 0,
  });
  return `${amount} ${target.payBasis === "hourly" ? "an hour" : "a year"}`;
}

export function TargetCard({ target, market }: { target: JobTarget; market?: MarketView }) {
  const [editing, setEditing] = useState(false);
  const pay = payText(target);
  const where =
    target.workplace === "remote_only"
      ? "Remote only"
      : `${target.locations.join(", ") || "Anywhere"} ${workplaceLabels[target.workplace]}`;

  if (editing) {
    return (
      <div className="rounded-lg border p-4">
        <TargetForm target={target} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex items-center gap-2 font-medium">
            {target.roleType}
            {!target.active && <Badge variant="secondary">Paused</Badge>}
          </p>
          <p className="text-sm text-muted-foreground">
            {where}
            {target.locationIsFirm && " (firm)"}
            {pay && ` · at least ${pay}${target.payIsFirm ? " (firm)" : ""}`}
            {target.desiredHours && ` · ${target.desiredHours} h/week`}
          </p>
          {target.note && <p className="whitespace-pre-line text-sm">{target.note}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <form action={setActiveAction}>
            <input type="hidden" name="id" value={target.id} />
            <input type="hidden" name="active" value={String(!target.active)} />
            <Button type="submit" variant="outline" size="sm">
              {target.active ? "Pause" : "Resume"}
            </Button>
          </form>
          <form action={deleteTargetAction}>
            <input type="hidden" name="id" value={target.id} />
            <Button type="submit" variant="ghost" size="sm">
              Delete
            </Button>
          </form>
        </div>
      </div>

      {market && target.active && <MarketNote market={market} />}

      <div className="flex flex-col gap-2 border-t pt-3">
        {target.searchTitleState === "proposing" && (
          <p className="text-sm text-muted-foreground">Suggesting search titles…</p>
        )}
        {target.searchTitleState === "failed" && (
          <p role="alert" className="text-sm text-destructive">
            Search titles could not be suggested right now. Type your own below, or try again.
          </p>
        )}
        {target.searchTitleState === "proposed" ? (
          <SearchTitlesForm
            key={`proposed-${target.proposedSearchTitles.join("|")}`}
            targetId={target.id}
            titles={[...target.searchTitles, ...target.proposedSearchTitles]}
            proposed
          />
        ) : (
          <SearchTitlesForm
            key={`approved-${target.searchTitles.join("|")}`}
            targetId={target.id}
            titles={target.searchTitles}
            proposed={false}
          />
        )}
        {target.searchTitleState !== "proposing" && (
          <form action={suggestTitlesAction}>
            <input type="hidden" name="id" value={target.id} />
            <Button type="submit" variant="link" size="sm" className="h-auto px-0">
              Suggest more titles
            </Button>
          </form>
        )}
        {target.searchTitles.length === 0 && target.searchTitleState !== "proposed" && (
          <p className="text-sm text-muted-foreground">
            No approved titles yet, so this target is not searched.
          </p>
        )}
      </div>
    </div>
  );
}
