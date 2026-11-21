import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMember } from "@/features/members/session";
import { ItemCard } from "@/features/profile/components/item-card";
import { ItemForm } from "@/features/profile/components/item-form";
import { RefreshWhile } from "@/features/profile/components/refresh-while";
import { ReviewPanel } from "@/features/profile/components/review-panel";
import { UploadForm } from "@/features/profile/components/upload-form";
import { sectionOrder } from "@/features/profile/item-fields";
import { latestUpload, listItems, type ProfileItem } from "@/features/profile/profile";

function UploadStatus({ upload }: { upload: Awaited<ReturnType<typeof latestUpload>> }) {
  if (!upload) return null;
  if (upload.state === "parsing") {
    return (
      <p className="text-sm text-muted-foreground">
        Reading {upload.filename}… this takes under a minute.
      </p>
    );
  }
  if (upload.state === "failed") {
    return (
      <p role="alert" className="text-sm text-destructive">
        {upload.filename}: {upload.failure}
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      Added {upload.itemsCreated} items from {upload.filename}. Check them below and correct
      anything that was read wrong.
    </p>
  );
}

async function Profile() {
  const { userId, name, member } = await requireMember();
  const [items, upload] = await Promise.all([listItems(userId), latestUpload(userId)]);
  const bulletsByParent = new Map<string, ProfileItem[]>();
  for (const item of items) {
    if (item.parentId) {
      bulletsByParent.set(item.parentId, [...(bulletsByParent.get(item.parentId) ?? []), item]);
    }
  }

  return (
    <>
      <SiteHeader name={name} isAdmin={member.role === "admin"} />
      <RefreshWhile active={upload?.state === "parsing"} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Master profile</h1>
          <p className="text-muted-foreground">
            Everything you could truthfully put in an application. Resumes and cover letters only
            ever use what is written here.
          </p>
        </div>
        {items.length > 0 && <ReviewPanel userId={userId} jobId={null} />}
        <Card>
          <CardHeader>
            <CardTitle>Start from a resume</CardTitle>
            <CardDescription>
              Upload a PDF, Word or text resume and it is split into items you can correct. Nothing
              is added that is not in the file.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <UploadForm />
            <UploadStatus upload={upload} />
          </CardContent>
        </Card>
        {sectionOrder.map(({ type, heading }) => {
          const sectionItems = items.filter((item) => item.type === type && !item.parentId);
          return (
            <section key={type} className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{heading}</h2>
              {sectionItems.map((item) => (
                <ItemCard key={item.id} item={item}>
                  {(type === "role" || type === "project") && (
                    <div className="mt-3 flex flex-col gap-1 border-t pt-3">
                      {(bulletsByParent.get(item.id) ?? []).map((bullet) => (
                        <ItemCard key={bullet.id} item={bullet} />
                      ))}
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm text-muted-foreground">
                          Add a bullet
                        </summary>
                        <div className="mt-2">
                          <ItemForm type="bullet" parentId={item.id} />
                        </div>
                      </details>
                    </div>
                  )}
                </ItemCard>
              ))}
              <details className="rounded-lg border border-dashed p-4">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Add to {heading.toLowerCase()}
                </summary>
                <div className="mt-3">
                  <ItemForm type={type} />
                </div>
              </details>
            </section>
          );
        })}
      </main>
    </>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Profile />
    </Suspense>
  );
}
