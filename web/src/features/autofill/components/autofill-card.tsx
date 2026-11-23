import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { applicationForJob } from "@/features/applications/applications";
import { approvedDocumentsForJob } from "@/features/documents/documents";
import { AutofillButton } from "./autofill-button";

/** Autofill on a job's page, with what will go into the form. */
export async function AutofillCard({ userId, jobId }: { userId: string; jobId: string }) {
  const [application, approved] = await Promise.all([
    applicationForJob(userId, jobId),
    approvedDocumentsForJob(userId, jobId),
  ]);
  const hasResume = application?.resumeId || approved.some((d) => d.kind === "resume");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Apply with autofill</CardTitle>
        <CardDescription>
          Opens the posting in a new tab and fills the application form from your contact details,
          approved documents and{" "}
          <Link href="/autofill" className="underline underline-offset-2">
            standard answers
          </Link>
          . Sign in there if the site asks. Every field it fills is highlighted. Nothing is sent
          until you review it and submit it yourself.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {!hasResume && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            No approved resume is attached yet, so the resume upload will be left for you. Approve a
            tailored resume, or pick a standing one under Your application.
          </p>
        )}
        <AutofillButton jobId={jobId} />
      </CardContent>
    </Card>
  );
}
