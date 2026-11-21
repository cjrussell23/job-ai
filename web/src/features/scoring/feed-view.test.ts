import { describe, expect, test } from "vitest";
import type { FeedItem } from "./feed";
import { annualPay, applyFeedView, defaultFeedView, parseFeedView } from "./feed-view";

const now = new Date("2026-11-21T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

function item(overrides: {
  id: string;
  combined?: number | null;
  targetFit?: number | null;
  profileFit?: number | null;
  targetId?: string;
  otherTargetIds?: string[];
  remote?: "remote" | "hybrid" | "onsite" | "unknown";
  pay?: { min: number; max: number; period: "hour" | "year" } | null;
  estimate?: { min: number; max: number; period: "hour" | "year" } | null;
  source?: string;
  seen?: Date;
  title?: string;
}): FeedItem {
  return {
    job: {
      id: overrides.id,
      title: overrides.title ?? "Developer",
      company: "Acme",
      location: "Calgary, AB",
      remote: overrides.remote ?? "unknown",
      payMin: overrides.pay?.min ?? null,
      payMax: overrides.pay?.max ?? null,
      payPeriod: overrides.pay?.period ?? null,
      payEstimateMin: overrides.estimate?.min ?? null,
      payEstimateMax: overrides.estimate?.max ?? null,
      payEstimatePeriod: overrides.estimate?.period ?? null,
      firstSeenAt: overrides.seen ?? now,
      postings: [{ source: overrides.source ?? "indeed" }],
    },
    best: {
      targetId: overrides.targetId ?? "t1",
      combined: overrides.combined ?? null,
      targetFit: overrides.targetFit ?? null,
      profileFit: overrides.profileFit ?? null,
    },
    otherTargets: [],
    otherTargetIds: overrides.otherTargetIds ?? [],
  } as unknown as FeedItem;
}

const ids = (items: FeedItem[]) => items.map((i) => i.job.id);

describe("reading the view from the URL", () => {
  test("bad or missing values fall back to defaults", () => {
    expect(parseFeedView({})).toEqual(defaultFeedView);
    expect(
      parseFeedView({ sort: "nonsense", minScore: "abc", workplace: ["remote", "x"] }),
    ).toMatchObject({
      sort: "best",
      minScore: 0,
      workplace: "remote",
    });
  });
});

describe("filters", () => {
  const items = [
    item({
      id: "a",
      combined: 85,
      remote: "remote",
      source: "linkedin",
      targetId: "t1",
      seen: daysAgo(0),
    }),
    item({
      id: "b",
      combined: 60,
      remote: "onsite",
      pay: { min: 20, max: 22, period: "hour" },
      targetId: "t2",
      seen: daysAgo(5),
    }),
    item({
      id: "c",
      combined: 72,
      estimate: { min: 80_000, max: 90_000, period: "year" },
      otherTargetIds: ["t2"],
      seen: daysAgo(20),
      title: "Data Analyst",
    }),
  ];
  const view = (overrides: Partial<typeof defaultFeedView>) => ({
    ...defaultFeedView,
    ...overrides,
  });

  test("by target, including jobs where it is a second target", () => {
    expect(ids(applyFeedView(items, view({ target: "t2" }), now))).toEqual(["c", "b"]);
  });
  test("by minimum score, workplace, pay, source, age and text", () => {
    expect(ids(applyFeedView(items, view({ minScore: 70 }), now))).toEqual(["a", "c"]);
    expect(ids(applyFeedView(items, view({ workplace: "remote" }), now))).toEqual(["a"]);
    expect(ids(applyFeedView(items, view({ pay: "stated" }), now))).toEqual(["b"]);
    expect(ids(applyFeedView(items, view({ pay: "any" }), now))).toEqual(["c", "b"]);
    expect(ids(applyFeedView(items, view({ source: "linkedin" }), now))).toEqual(["a"]);
    expect(ids(applyFeedView(items, view({ age: "7" }), now))).toEqual(["a", "b"]);
    expect(ids(applyFeedView(items, view({ q: "analyst" }), now))).toEqual(["c"]);
  });
});

describe("sorting", () => {
  test("by match, newest, either fit, and pay with unknown pay last", () => {
    const items = [
      item({ id: "a", combined: 70, targetFit: 90, profileFit: 40, seen: daysAgo(3) }),
      item({
        id: "b",
        combined: 80,
        targetFit: 60,
        profileFit: 95,
        pay: { min: 25, max: 25, period: "hour" },
        seen: daysAgo(1),
      }),
      item({
        id: "c",
        combined: null,
        seen: daysAgo(0),
        estimate: { min: 60_000, max: 70_000, period: "year" },
      }),
    ];
    const sorted = (sort: typeof defaultFeedView.sort) =>
      ids(applyFeedView(items, { ...defaultFeedView, sort }, now));
    expect(sorted("best")).toEqual(["b", "a", "c"]);
    expect(sorted("newest")).toEqual(["c", "b", "a"]);
    expect(sorted("target")).toEqual(["a", "b", "c"]);
    expect(sorted("profile")).toEqual(["b", "a", "c"]);
    // $25/h is $52,000 a year, below the $70,000 estimate; no pay sorts last.
    expect(sorted("pay")).toEqual(["c", "b", "a"]);
    expect(annualPay(items[0] as FeedItem)).toBeNull();
  });
});
