import type { Loosening, MarketView } from "@/features/scoring/market";

// Kept here, not imported from market.ts, so this renders inside client components.
const labels: Record<Loosening, string> = {
  pay_preference: "Make pay a preference instead of a firm limit",
  location_preference: "Make location a preference instead of a firm limit",
  show_unknown_pay: "Show jobs that don't state pay",
  show_unknown_location: "Show jobs that don't state a location",
  lower_pay: "Lower your minimum pay by 10%",
};

/** Below this many open jobs, a target is flagged as narrow. */
const fewJobs = 5;

/** Real counts for loosening a target's firm limits, from jobs already found for it. */
export function MarketNote({ market }: { market: MarketView }) {
  const narrow = market.passing < fewJobs;
  if (!narrow && market.options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {market.passing} open jobs pass this target's firm limits.
      </p>
    );
  }
  return (
    <div
      className={`flex flex-col gap-1 rounded-md p-3 text-sm ${narrow ? "bg-amber-500/10" : "bg-muted/50"}`}
    >
      <p className={narrow ? "font-medium" : undefined}>
        {market.passing === 1 ? "1 open job passes" : `${market.passing} open jobs pass`} this
        target's firm limits{narrow ? ", which is few." : "."}
      </p>
      {market.options.length > 0 && (
        <ul className="list-disc pl-5">
          {market.options.map((o) => (
            <li key={o.kind}>
              {labels[o.kind]}: <span className="font-medium tabular-nums">+{o.added}</span>
            </li>
          ))}
        </ul>
      )}
      {narrow && (
        <p className="text-muted-foreground">
          More search titles also widen the search: try "Suggest more titles" below.
        </p>
      )}
    </div>
  );
}
