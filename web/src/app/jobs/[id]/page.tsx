import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { RefreshWhile } from "@/components/refresh-while";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApplicationPanel } from "@/features/applications/components/application-panel";
import { approveAction, draftAction } from "@/features/documents/actions";
import { documentBodySchema } from "@/features/documents/body";
import { DocumentEditor } from "@/features/documents/components/document-editor";
import { type Document, documentsForJob } from "@/features/documents/documents";
import { jobsWithPostings, payText } from "@/features/jobs/jobs";
import { requireMember } from "@/features/members/session";
import { ReviewPanel } from "@/features/profile/components/review-panel";
import { sourceLabel } from "@/features/sources/catalogue";

const kindLabels = { resume: "Tailored resume", cover_letter: "Cover letter" } as const;
const stateLabels = {
  generating: "Writing…",
  draft: "Draft",
  approved: "Approved",
  failed: "Failed",
} as const;

function DocumentCard({ doc, jobId }: { doc: Document; jobId: string }) {
  const body = documentBodySchema.safeParse(doc.body);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {kindLabels[doc.kind]}
          <Badge
            variant={
              doc.state === "approved"
                ? "secondary"
                : doc.state === "failed"
                  ? "destructive"
                  : "outline"
            }
          >
            {stateLabels[doc.state]}
          </Badge>
          <span className="text-xs font-normal text-muted-foreground">version {doc.version}</span>
        </CardTitle>
        <CardDescription>
          {doc.state === "approved"
            ? "Approved: this version can be used in your application. Any edit returns it to draft."
            : "Every line comes from your profile. Check the wording, change what you like, then approve."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {doc.state === "generating" && (
          <p className="text-sm text-muted-foreground">
            Writing from your profile; this takes under a minute.
          </p>
        )}
        {doc.state === "failed" && (
          <p role="alert" className="text-sm text-destructive">
            {doc.failure}
          </p>
        )}
        {body.success && doc.state !== "generating" && (
          <>
            <DocumentEditor
              key={`${doc.id}-${doc.version}-${doc.updatedAt.getTime()}`}
              documentId={doc.id}
              body={body.data}
              saved={body.data}
            />
            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              {doc.state === "draft" && (
                <form action={approveAction}>
                  <input type="hidden" name="documentId" value={doc.id} />
                  <Button type="submit">Approve</Button>
                </form>
              )}
              <a
                href={`/documents/${doc.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                {doc.state === "approved" ? "Download PDF" : "Preview PDF"}
              </a>
            </div>
          </>
        )}
        {doc.state !== "generating" && (
          <form action={draftAction}>
            <input type="hidden" name="jobId" value={jobId} />
            <input type="hidden" name="kind" value={doc.kind} />
            <Button type="submit" variant="ghost" size="sm">
              Write a new version
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

async function JobPage({ params }: { params: PageProps<"/jobs/[id]">["params"] }) {
  const { userId, name, member } = await requireMember();
  const { id } = await params;
  const [job] = await jobsWithPostings([id]);
  if (!job) notFound();
  const docs = await documentsForJob(userId, id);
  const byKind = (kind: Document["kind"]) => docs.find((d) => d.kind === kind);
  const writing = docs.some((d) => d.state === "generating");

  return (
    <>
      <SiteHeader name={name} isAdmin={member.role === "admin"} />
      <RefreshWhile active={writing} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          <p className="text-muted-foreground">
            {job.company}
            {job.location && ` · ${job.location}`} ·{" "}
            {payText(job)
              .replace(/^unknown \(estimated/, "Pay not listed (estimate")
              .replace(/^unknown$/, "Pay not listed")}
          </p>
          <ul className="flex flex-wrap gap-3 text-sm">
            {job.postings.map((p) => (
              <li key={p.id}>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2"
                >
                  {sourceLabel(p.source)} <ExternalLink className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
        <ApplicationPanel userId={userId} jobId={job.id} />
        {docs.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Tailor your application</CardTitle>
              <CardDescription>
                Writes a one-page resume and a cover letter for this job from your master profile
                only. Nothing is added that your profile doesn't say, and nothing is sent anywhere:
                you review and approve both.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={draftAction}>
                <input type="hidden" name="jobId" value={job.id} />
                <Button type="submit">Write my resume and cover letter</Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          (["resume", "cover_letter"] as const).map((kind) => {
            const doc = byKind(kind);
            return doc ? (
              <DocumentCard key={doc.id} doc={doc} jobId={job.id} />
            ) : (
              <form key={kind} action={draftAction}>
                <input type="hidden" name="jobId" value={job.id} />
                <input type="hidden" name="kind" value={kind} />
                <Button type="submit" variant="outline">
                  Write a {kindLabels[kind].toLowerCase()}
                </Button>
              </form>
            );
          })
        )}
        <ReviewPanel userId={userId} jobId={job.id} />
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Job description</summary>
          <p className="mt-2 whitespace-pre-line">{job.description || "No description."}</p>
        </details>
      </main>
    </>
  );
}

export default function Page({ params }: PageProps<"/jobs/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <JobPage params={params} />
    </Suspense>
  );
}
