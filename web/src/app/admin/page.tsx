import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AiSettingsForm } from "@/features/admin/components/ai-settings-form";
import { InviteForm } from "@/features/admin/components/invite-form";
import { MembersTable } from "@/features/admin/components/members-table";
import { getSettings } from "@/features/admin/settings";
import { spendThisMonthByUser } from "@/features/ai/usage";
import { listMembers } from "@/features/members/members";
import { requireAdmin } from "@/features/members/session";

// The dashboard deliberately shows no member's profile, documents or applications.
async function AdminDashboard() {
  const { name } = await requireAdmin();
  const [members, settings, spendByUser] = await Promise.all([
    listMembers(),
    getSettings(),
    spendThisMonthByUser(),
  ]);
  return (
    <>
      <SiteHeader name={name} isAdmin />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              Inviting a Google address lets that person sign in. Removing a member deletes
              everything they own. A blank cap uses the default. Spend is counted per calendar month
              (UTC).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <InviteForm />
            <MembersTable
              members={members}
              defaultSpendCapCents={settings.defaultSpendCapCents}
              spendByUser={spendByUser}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AI</CardTitle>
            <CardDescription>
              The model used for each task, and the monthly spend cap for members without their own.
              The API key is set on the server, not here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AiSettingsForm
              models={settings.models}
              defaultSpendCapCents={settings.defaultSpendCapCents}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <AdminDashboard />
    </Suspense>
  );
}
