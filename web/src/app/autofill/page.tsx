import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getStandardAnswers, listSavedAnswers } from "@/features/autofill/answers";
import { SavedAnswerRow } from "@/features/autofill/components/saved-answer-row";
import { StandardAnswersForm } from "@/features/autofill/components/standard-answers-form";
import { requireMember } from "@/features/members/session";

async function Autofill() {
  const { userId, name, member } = await requireMember();
  const [standard, saved] = await Promise.all([
    getStandardAnswers(userId),
    listSavedAnswers(userId),
  ]);
  return (
    <>
      <SiteHeader name={name} isAdmin={member.role === "admin"} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Autofill</h1>
          <p className="text-sm text-muted-foreground">
            Fills in employers' application forms in your own browser, from your contact details,
            the documents you approved for the job, and the answers below. You review every field
            and press the employer's submit button yourself. Your job-site sign-ins never leave your
            browser.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Install the extension</CardTitle>
            <CardDescription>
              A small Chrome extension does the filling. It works in Chrome, Edge, Brave and Arc.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                <a
                  href="/autofill/extension.zip"
                  className="font-medium underline underline-offset-2"
                >
                  Download the extension
                </a>{" "}
                and unzip it somewhere you'll keep it.
              </li>
              <li>
                Open <code className="rounded bg-muted px-1">chrome://extensions</code> and turn on
                Developer mode (top right).
              </li>
              <li>Click Load unpacked and choose the unzipped folder.</li>
              <li>Reload any job page here. Apply with autofill then opens and fills the form.</li>
            </ol>
            <p className="text-muted-foreground">
              It reads pages only in the tabs autofill opens, and it never presses submit. To update
              it, download it again, replace the folder, and click reload on the extension.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Standard answers</CardTitle>
            <CardDescription>
              Questions most forms ask. Anything left blank is left for you to answer on the form.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StandardAnswersForm answers={standard} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saved answers</CardTitle>
            <CardDescription>
              Answers you chose to remember from earlier forms. The same question is filled the same
              way next time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {saved.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None yet. When you finish a form, the extension offers to remember your answers.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {saved.map((s) => (
                  <SavedAnswerRow key={s.id} id={s.id} question={s.question} answer={s.answer} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Autofill />
    </Suspense>
  );
}
