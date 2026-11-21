import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteAccountForm } from "@/features/account/components/delete-account-form";
import { FeedSettingsForm } from "@/features/account/components/feed-settings-form";
import { requireMember } from "@/features/members/session";

async function Account() {
  const { name, member } = await requireMember();
  return (
    <>
      <SiteHeader name={name} isAdmin={member.role === "admin"} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
          <p className="text-muted-foreground">Signed in as {member.email}.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Your feed</CardTitle>
            <CardDescription>
              How matches are ranked, and which ones are worth a notification.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FeedSettingsForm
              scoreThreshold={member.scoreThreshold}
              targetFitWeight={member.targetFitWeight}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Download your data</CardTitle>
            <CardDescription>
              A JSON file with your profile, uploaded resume text, job targets and AI usage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a href="/account/export" className={buttonVariants({ variant: "outline" })}>
              Download my data
            </a>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Delete your account</CardTitle>
            <CardDescription>
              Permanently deletes your account and everything you have added, straight away. Jobs
              shared between members are not affected. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteAccountForm email={member.email} />
          </CardContent>
        </Card>
      </main>
    </>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Account />
    </Suspense>
  );
}
