import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMember } from "@/features/members/session";
import { removeCompanyAction } from "@/features/sources/actions";
import { AddCompanyForm } from "@/features/sources/components/add-company-form";
import { listWatchedCompanies } from "@/features/sources/watched-companies";

const systemLabels = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby" } as const;

async function Companies() {
  const { name, member } = await requireMember();
  const companies = await listWatchedCompanies();
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
            <CardTitle>Watch a company</CardTitle>
            <CardDescription>
              Paste the link to the company's Greenhouse, Lever or Ashby job board, usually found
              from the jobs or careers page.
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
