import type { ResumeScore } from "@/features/documents/score";

/** A resume's score out of 100 and its aspects, each with what would raise it. */
export function ScoreCard({ score }: { score: ResumeScore }) {
  const tone = (n: number) =>
    n >= 80 ? "bg-emerald-500" : n >= 60 ? "bg-amber-500" : "bg-rose-500";
  return (
    <details className="rounded-md border p-3 text-sm" open>
      <summary className="flex cursor-pointer items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{score.total}</span>
        <span className="text-muted-foreground">/ 100 resume score</span>
      </summary>
      <ul className="mt-3 flex flex-col gap-2">
        {score.aspects.map((a) => (
          <li key={a.key} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-28 shrink-0">{a.label}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
                <span
                  className={`block h-full ${tone(a.score)}`}
                  style={{ width: `${a.score}%` }}
                />
              </span>
              <span className="w-8 text-right tabular-nums">{a.score}</span>
            </div>
            <span className="pl-28 text-xs text-muted-foreground">{a.detail}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
