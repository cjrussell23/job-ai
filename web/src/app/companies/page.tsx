import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMember } from "@/features/members/session";
import {
  findBoardsAction,
  removeCompanyAction,
  watchSuggestedAction,
} from "@/features/sources/actions";
import { suggestedCompaniesFor } from "@/features/sources/company-suggestions";
import { AddCompanyForm } from "@/features/sources/components/add-company-form";
import { listWatchedCompanies } from "@/features/sources/watched-companies";

const systemLabels = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workday: "Workday",
} as const;

async function Companies() {
  const { userId, name, member } = await requireMember();
  const [companies, suggestions] = await Promise.all([
    listWatchedCompanies(),
    suggestedCompaniesFor(userId),
  ]);
  const isAdmin = member.role === "admin";
  return (
    <>
      <SiteHeader name={name} isAdmin={isAdmin} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Watched companies</h1>
          <p className="text-muted-foreground">
            Companies whose own job boards are read in every daily run, shared by everyone. Their
            jobs are matched against each member's targets like any other. Companies are also added
            automatically when a job posting links to their board.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Suggested from your matches</CardTitle>
            <CardDescription>
              Companies in your matches whose own Greenhouse, Lever or Ashby board was found.
              Watching one reads every job on its board each morning, including ones the job sites
              miss. Check the board link first: the match is by name.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None yet. Boards are looked for after each morning's run.
              </p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {suggestions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{s.companyName}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.yourMatches} of your matches · {s.openJobs ?? 0} open jobs on{" "}
                        <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                          {s.system ? systemLabels[s.system] : "its board"}
                        </a>
                      </span>
                    </div>
                    <form action={watchSuggestedAction}>
                      <input type="hidden" name="url" value={s.url} />
                      <input type="hidden" name="name" value={s.companyName} />
                      <Button type="submit" size="sm" variant="outline">
                        Watch
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={findBoardsAction}>
              <Button type="submit" size="sm" variant="ghost">
                Look for more now
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Watch a company</CardTitle>
            <CardDescription>
              Paste the link to the company's Greenhouse, Lever, Ashby or Workday job board, usually
              found from the jobs or careers page. Big Calgary employers on Workday include Cenovus,
              Suncor, TC Energy and ENMAX.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AddCompanyForm />
          </CardContent>
        </Card>
        <ul className="flex flex-col divide-y rounded-lg border">
          {companies.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">No companies watched yet.</li>
          )}
          {companies.map((company) => (
            <li key={company.id} className="flex items-center gap-3 p-4">
              <span className="flex-1 font-medium">{company.name}</span>
              <Badge variant="outline">{systemLabels[company.system]}</Badge>
              {company.origin === "discovered" && (
                <Badge variant="secondary">Found automatically</Badge>
              )}
              {isAdmin && (
                <form action={removeCompanyAction}>
                  <input type="hidden" name="id" value={company.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Remove
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}

export default function CompaniesPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Companies />
    </Suspense>
  );
}
