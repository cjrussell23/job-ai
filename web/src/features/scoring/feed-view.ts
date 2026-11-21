import { z } from "zod";
import { toAnnual } from "@/features/targets/pay";
import type { FeedItem } from "./feed";

/** How the member wants the feed filtered and sorted, read from the page's URL. */
export const feedViewSchema = z.object({
  sort: z.enum(["best", "newest", "target", "profile", "pay"]).catch("best"),
  target: z.string().catch(""),
  minScore: z.coerce.number().int().min(0).max(100).catch(0),
  workplace: z.enum(["", "remote", "hybrid", "onsite"]).catch(""),
  pay: z.enum(["", "stated", "any"]).catch(""),
  source: z.string().catch(""),
  age: z.enum(["", "1", "3", "7", "30"]).catch(""),
  q: z.string().trim().max(100).catch(""),
});
export type FeedView = z.infer<typeof feedViewSchema>;

export const defaultFeedView: FeedView = feedViewSchema.parse({});

export function parseFeedView(params: Record<string, string | string[] | undefined>): FeedView {
  const flat = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  return feedViewSchema.parse(flat);
}

/**
 * A yearly figure for sorting by pay: stated pay first (top of the range), then an
 * estimate. Unknown pay sorts last. Hourly pay is annualized at 40 hours a week.
 */
export function annualPay(item: FeedItem): number | null {
  const { job } = item;
  const stated = job.payMax ?? job.payMin;
  if (job.payPeriod && stated !== null) return toAnnual(stated, job.payPeriod);
  const estimate = job.payEstimateMax ?? job.payEstimateMin;
  if (job.payEstimatePeriod && estimate !== null) return toAnnual(estimate, job.payEstimatePeriod);
  return null;
}

const descending = (a: number | null, b: number | null) => (b ?? -1) - (a ?? -1);

/** Filters and sorts feed items. Pure, so the page and tests share it. */
export function applyFeedView(
  items: FeedItem[],
  view: FeedView,
  now: Date = new Date(),
): FeedItem[] {
  const query = view.q.toLowerCase();
  const maxAgeMs = view.age ? Number(view.age) * 86_400_000 : null;
  const filtered = items.filter((item) => {
    const { job, best } = item;
    if (
      view.target &&
      best.targetId !== view.target &&
      !item.otherTargetIds.includes(view.target)
    ) {
      return false;
    }
    if (view.minScore > 0 && (best.combined ?? -1) < view.minScore) return false;
    if (view.workplace && job.remote !== view.workplace) return false;
    if (view.pay === "stated" && !job.payPeriod) return false;
    if (view.pay === "any" && !job.payPeriod && !job.payEstimatePeriod) return false;
    if (view.source && !job.postings.some((p) => p.source === view.source)) return false;
    if (maxAgeMs !== null && now.getTime() - job.firstSeenAt.getTime() > maxAgeMs) return false;
    if (query && !`${job.title} ${job.company} ${job.location}`.toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });
  const newest = (a: FeedItem, b: FeedItem) =>
    b.job.firstSeenAt.getTime() - a.job.firstSeenAt.getTime();
  const sorters: Record<FeedView["sort"], (a: FeedItem, b: FeedItem) => number> = {
    best: (a, b) => descending(a.best.combined, b.best.combined) || newest(a, b),
    newest,
    target: (a, b) => descending(a.best.targetFit, b.best.targetFit) || newest(a, b),
    profile: (a, b) => descending(a.best.profileFit, b.best.profileFit) || newest(a, b),
    pay: (a, b) => descending(annualPay(a), annualPay(b)) || newest(a, b),
  };
  return [...filtered].sort(sorters[view.sort]);
}
