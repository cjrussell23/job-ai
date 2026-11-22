import { Building2, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { lookUpCompanyAction } from "@/features/jobs/company-actions";
import type { CompanyProfile } from "@/features/jobs/company-profiles";
import { appTimeZone } from "@/features/runs/time";

const day = (d: Date) =>
  d.toLocaleDateString("en-CA", { timeZone: appTimeZone, dateStyle: "medium" });

/** One line for a match card: size, industry and rating, when known. */
export function companyLine(profile: CompanyProfile | undefined): string | null {
  const f = profile?.facts;
  if (!f) return null;
  const rating =
    f.reviews?.rating != null
      ? `★ ${f.reviews.rating}${f.reviews.outOf ? `/${f.reviews.outOf}` : ""}${f.reviews.site ? ` on ${f.reviews.site}` : ""}`
      : null;
  const parts = [f.industry, f.employees ? `${f.employees} employees` : null, rating].filter(
    Boolean,
  );
  return parts.length ? parts.join(" · ") : null;
}

/** What a web search says about the company, with its sources. AI-written, so labelled. */
export function CompanyCard({
  company,
  jobId,
  profile,
}: {
  company: string;
  jobId: string;
  profile: CompanyProfile | undefined;
}) {
  const f = profile?.facts;
  if (!f) {
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm">
        <Building2 className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-muted-foreground">
          {profile?.failure
            ? `Looking up ${company} didn't work last time.`
            : `No description of ${company} yet. It's looked up after the next daily run.`}
        </span>
        <form action={lookUpCompanyAction}>
          <input type="hidden" name="company" value={company} />
          <input type="hidden" name="jobId" value={jobId} />
          <Button type="submit" size="sm" variant="outline">
            Look it up now
          </Button>
        </form>
      </section>
    );
  }
  const facts: [string, string | null][] = [
    ["Industry", f.industry],
    ["Size", f.employees],
    ["Headquarters", f.headquarters],
    ["Founded", f.founded],
    ["Ownership", f.ownership],
  ];
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Building2 className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="font-semibold">About {company}</h2>
        {f.confidence === "low" && <Badge variant="outline">Low confidence</Badge>}
      </div>
      <p>{f.summary}</p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {f.reviews && (f.reviews.rating != null || f.reviews.summary) && (
        <p>
          <span className="font-medium">
            Reviews
            {f.reviews.rating != null &&
              `: ★ ${f.reviews.rating}${f.reviews.outOf ? `/${f.reviews.outOf}` : ""}`}
            {f.reviews.site && ` on ${f.reviews.site}`}.
          </span>{" "}
          {f.reviews.summary}
        </p>
      )}
      {f.notable.length > 0 && (
        <ul className="list-disc pl-5">
          {f.notable.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {f.website && /^https?:\/\//.test(f.website) && (
          <a
            href={f.website}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            Website <ExternalLink className="size-3" />
          </a>
        )}
        {profile.sources.map((s) => (
          <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="underline">
            {s.title || new URL(s.url).hostname}
          </a>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Written by AI from a web search on {day(profile.generatedAt)}. Check the sources before
        relying on it.
      </p>
    </section>
  );
}
