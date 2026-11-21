"use client";

import {
  CircleCheck,
  CircleHelp,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rateSummaryAction } from "@/features/scoring/actions";

type Point = { kind: "plus" | "watch" | "check"; text: string };

type Props = {
  id: string;
  jobId: string;
  headline: string;
  points: Point[];
  rating: "up" | "down" | null;
  reason: string | null;
};

const downReasons = [
  ["too_generic", "Too generic"],
  ["wrong", "Got something wrong"],
  ["missed_something", "Missed what matters"],
  ["too_long", "Too long"],
] as const;

const icons = {
  plus: (
    <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Good for you" />
  ),
  watch: <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-label="Watch out" />,
  check: <CircleHelp className="mt-0.5 size-4 shrink-0 text-sky-600" aria-label="Worth asking" />,
};

/** An AI read of what matters to this member about the job, with ratings that tune later ones. */
export function MatchSummary({ id, jobId, headline, points, rating, reason }: Props) {
  const [choosing, setChoosing] = useState(false);
  const hidden = (
    <>
      <input type="hidden" name="summaryId" value={id} />
      <input type="hidden" name="jobId" value={jobId} />
    </>
  );
  return (
    <section className="flex flex-col gap-2 rounded-md bg-muted/50 p-3 text-sm">
      <p className="flex items-start gap-2 font-medium">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        {headline}
      </p>
      <ul className="flex flex-col gap-1">
        {points.map((p) => (
          <li key={`${p.kind}-${p.text}`} className="flex items-start gap-2">
            {icons[p.kind]}
            <span>{p.text}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <span className="mr-1">AI summary. Helpful?</span>
        <form action={rateSummaryAction}>
          {hidden}
          <input type="hidden" name="rating" value="up" />
          <input type="hidden" name="reason" value="useful" />
          <Button
            type="submit"
            variant={rating === "up" ? "secondary" : "ghost"}
            size="icon"
            className="size-7"
            aria-label="Helpful summary"
            aria-pressed={rating === "up"}
          >
            <ThumbsUp className="size-3.5" />
          </Button>
        </form>
        <Button
          type="button"
          variant={rating === "down" ? "secondary" : "ghost"}
          size="icon"
          className="size-7"
          aria-label="Not helpful"
          aria-pressed={rating === "down"}
          onClick={() => setChoosing((open) => !open)}
        >
          <ThumbsDown className="size-3.5" />
        </Button>
        {rating === "down" && reason && !choosing && (
          <span>{downReasons.find(([value]) => value === reason)?.[1]}</span>
        )}
      </div>
      {choosing && (
        <form
          action={async (form) => {
            await rateSummaryAction(form);
            setChoosing(false);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          {hidden}
          <input type="hidden" name="rating" value="down" />
          <select
            name="reason"
            className="h-8 rounded-md border bg-background px-2 text-xs"
            defaultValue="too_generic"
          >
            {downReasons.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Input
            name="comment"
            placeholder="What should it point out? (optional)"
            className="h-8 max-w-xs text-xs"
            maxLength={500}
          />
          <Button type="submit" size="sm" variant="outline">
            Send
          </Button>
        </form>
      )}
    </section>
  );
}
