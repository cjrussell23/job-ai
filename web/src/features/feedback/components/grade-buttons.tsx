"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { gradeAction } from "@/features/feedback/actions";

const reasons = [
  ["pay", "Pay"],
  ["wrong_role", "Wrong role"],
  ["too_senior", "Too senior"],
  ["location", "Location"],
  ["company", "Company"],
  ["other", "Other"],
] as const;

type Props = {
  jobId: string;
  targetId: string;
  grade: "up" | "down" | null;
  reason: string | null;
};

/** Thumbs up, or thumbs down with a quick reason. Grades shape future scoring. */
export function GradeButtons({ jobId, targetId, grade, reason }: Props) {
  const [choosing, setChoosing] = useState(false);
  const hidden = (
    <>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="targetId" value={targetId} />
    </>
  );
  return (
    <div className="flex flex-wrap items-center gap-1">
      <form action={gradeAction}>
        {hidden}
        <input type="hidden" name="kind" value="up" />
        <Button
          type="submit"
          variant={grade === "up" ? "secondary" : "ghost"}
          size="icon"
          aria-label="Good suggestion"
          aria-pressed={grade === "up"}
        >
          <ThumbsUp />
        </Button>
      </form>
      <Button
        type="button"
        variant={grade === "down" ? "secondary" : "ghost"}
        size="icon"
        aria-label="Not for me"
        aria-pressed={grade === "down"}
        onClick={() => setChoosing((open) => !open)}
      >
        <ThumbsDown />
      </Button>
      {grade === "down" && reason && !choosing && (
        <span className="text-xs text-muted-foreground">
          {reasons.find(([value]) => value === reason)?.[1]}
        </span>
      )}
      {choosing && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground">Why?</span>
          {reasons.map(([value, label]) => (
            <form key={value} action={gradeAction} onSubmit={() => setChoosing(false)}>
              {hidden}
              <input type="hidden" name="kind" value="down" />
              <input type="hidden" name="reason" value={value} />
              <Button type="submit" variant="outline" size="sm">
                {label}
              </Button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
