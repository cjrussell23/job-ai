import { Badge } from "@/components/ui/badge";
import type { Job } from "@/features/jobs/jobs";

const money = (n: number) =>
  n.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: n < 1000 ? 2 : 0,
  });

function range(min: number | null, max: number | null) {
  if (min === null && max === null) return "";
  if (min === null || max === null || min === max) return money(min ?? max ?? 0);
  return `${money(min)}–${money(max)}`;
}

const memberLabels = { entered: "you entered", confirmed_estimate: "estimate you confirmed" };

/**
 * A job's pay: the member's own figure, stated pay, or "not listed" with a clearly
 * labelled estimate whose source shows on hover or focus (ADR 0002, ADR 0003).
 */
export function Pay({ job }: { job: Job & { memberPay?: "entered" | "confirmed_estimate" } }) {
  if (job.payPeriod) {
    return (
      <span>
        {`${range(job.payMin, job.payMax)} per ${job.payPeriod}`}
        {job.memberPay && (
          <Badge variant="outline" className="ml-1">
            {memberLabels[job.memberPay]}
          </Badge>
        )}
      </span>
    );
  }
  if (job.payEstimatePeriod && job.payEstimateCertainty) {
    return (
      <span className="group relative inline-flex flex-wrap items-center gap-1">
        Pay not listed ·
        <button
          type="button"
          className="cursor-help italic underline decoration-dotted underline-offset-2"
        >
          estimate {range(job.payEstimateMin, job.payEstimateMax)} per {job.payEstimatePeriod}
        </button>
        <Badge variant="outline" className="cursor-help">
          {job.payEstimateCertainty} certainty
        </Badge>
        <span
          role="tooltip"
          className="pointer-events-none invisible absolute top-full left-0 z-20 mt-1 w-80 rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md group-focus-within:visible group-hover:visible"
        >
          <span className="block font-medium">Where this estimate comes from</span>
          <span className="mt-1 block">
            An AI estimate from this job's title, company, location and description. No posting
            states pay, so it never counts against your pay limits.
          </span>
          {job.payEstimateReason && (
            <span className="mt-1 block text-muted-foreground">
              Reasoning: {job.payEstimateReason}
            </span>
          )}
        </span>
      </span>
    );
  }
  return <span>Pay not listed</span>;
}
