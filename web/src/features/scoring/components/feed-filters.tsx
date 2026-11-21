"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FeedView } from "@/features/scoring/feed-view";

type Option = { value: string; label: string };
type Props = {
  view: FeedView;
  targets: Option[];
  sources: Option[];
  shown: number;
  total: number;
};

const selectClass = "h-9 rounded-md border bg-transparent px-2 text-sm";

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: Option[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`filter-${name}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <select id={`filter-${name}`} name={name} defaultValue={value} className={selectClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Filters live in the URL, so a filtered feed can be refreshed or bookmarked. */
export function FeedFilters({ view, targets, sources, shown, total }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const form = useRef<HTMLFormElement>(null);

  const apply = () => {
    if (!form.current) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form.current)) {
      if (
        typeof value === "string" &&
        value !== "" &&
        !(key === "sort" && value === "best") &&
        !(key === "minScore" && value === "0")
      ) {
        params.set(key, value);
      }
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const filtered = shown !== total;
  return (
    <form
      ref={form}
      onChange={apply}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
    >
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <Label htmlFor="filter-q" className="text-xs text-muted-foreground">
          Search
        </Label>
        <Input id="filter-q" name="q" defaultValue={view.q} placeholder="Title, company or place" />
      </div>
      <Select
        name="sort"
        label="Sort by"
        value={view.sort}
        options={[
          { value: "best", label: "Best match" },
          { value: "newest", label: "Newest" },
          { value: "target", label: "Target fit" },
          { value: "profile", label: "Profile fit" },
          { value: "pay", label: "Pay (highest first)" },
        ]}
      />
      <Select
        name="target"
        label="Job target"
        value={view.target}
        options={[{ value: "", label: "All targets" }, ...targets]}
      />
      <Select
        name="minScore"
        label="Match score"
        value={String(view.minScore)}
        options={[
          { value: "0", label: "Any" },
          { value: "50", label: "50+" },
          { value: "60", label: "60+" },
          { value: "70", label: "70+" },
          { value: "80", label: "80+" },
        ]}
      />
      <Select
        name="workplace"
        label="Workplace"
        value={view.workplace}
        options={[
          { value: "", label: "Any" },
          { value: "remote", label: "Remote" },
          { value: "hybrid", label: "Hybrid" },
          { value: "onsite", label: "On-site" },
        ]}
      />
      <Select
        name="pay"
        label="Pay"
        value={view.pay}
        options={[
          { value: "", label: "Any" },
          { value: "stated", label: "Pay listed" },
          { value: "any", label: "Listed or estimated" },
        ]}
      />
      <Select
        name="source"
        label="Source"
        value={view.source}
        options={[{ value: "", label: "All sources" }, ...sources]}
      />
      <Select
        name="age"
        label="Found"
        value={view.age}
        options={[
          { value: "", label: "Any time" },
          { value: "1", label: "Last day" },
          { value: "3", label: "Last 3 days" },
          { value: "7", label: "Last week" },
          { value: "30", label: "Last month" },
        ]}
      />
      <div className="flex items-center gap-3">
        {filtered && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.replace(pathname, { scroll: false })}
          >
            Clear
          </Button>
        )}
        <span className="text-sm text-muted-foreground">
          {filtered ? `${shown} of ${total}` : `${total}`} {total === 1 ? "job" : "jobs"}
        </span>
      </div>
    </form>
  );
}
