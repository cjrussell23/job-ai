import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { SiteHeader } from "@/components/site-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { resumeBodySchema } from "@/features/documents/body";
import { type BuilderItem, ResumeBuilder } from "@/features/documents/components/resume-builder";
import { getStandingResume, pickedItems, resumeItems } from "@/features/documents/standing";
import { deleteStandingResumeAction } from "@/features/documents/standing-actions";
import { requireMember } from "@/features/members/session";
import { listItems, type ProfileItem } from "@/features/profile/profile";

const builderTypes = new Set(["role", "project", "certification", "skill", "bullet"]);

function toBuilderItem(item: ProfileItem): BuilderItem | null {
  if (!builderTypes.has(item.type)) return null;
  const dates = [item.startDate, item.endDate].filter(Boolean).join(" – ");
  return {
    id: item.id,
    type: item.type as BuilderItem["type"],
    parentId: item.parentId,
    label: item.type === "bullet" ? item.content : item.title || "(untitled)",
    detail: item.type === "bullet" ? "" : [item.organization, dates].filter(Boolean).join(", "),
  };
}

async function Builder({ params }: { params: PageProps<"/resumes/[id]">["params"] }) {
  const { userId, name, member } = await requireMember();
  const { id } = await params;
  const isNew = id === "new";
  const doc = isNew ? undefined : await getStandingResume(userId, id);
  if (!isNew && !doc) notFound();
  const body = resumeBodySchema.safeParse(doc?.body);
  const items = resumeItems(await listItems(userId))
    .map(toBuilderItem)
    .filter((i): i is BuilderItem => i !== null);
  // A new resume starts with everything picked; trimming is easier than building up.
  const picked = body.success ? [...pickedItems(body.data)] : items.map((i) => i.id);

  return (
    <>
      <SiteHeader name={name} isAdmin={member.role === "admin"} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Link href="/resumes" className="text-sm text-muted-foreground hover:underline">
              Standing resumes
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">
              {doc ? doc.name : "New resume"}
            </h1>
            <p className="text-muted-foreground">
              Pick what to show. Every line is your profile's own wording; to change it, edit your{" "}
              <Link href="/profile" className="underline">
                profile
              </Link>{" "}
              and save this resume again.
            </p>
          </div>
          {doc && (
            <div className="flex gap-2">
              <a
                href={`/documents/${doc.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                Download PDF
              </a>
              <form action={deleteStandingResumeAction}>
                <input type="hidden" name="id" value={doc.id} />
                <Button type="submit" variant="ghost">
                  Delete
                </Button>
              </form>
            </div>
          )}
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Your profile has nothing to put on a resume yet.{" "}
            <Link href="/profile" className="underline">
              Add to your profile
            </Link>
            .
          </p>
        ) : (
          <ResumeBuilder
            id={doc?.id ?? null}
            name={doc?.name ?? ""}
            items={items}
            picked={picked}
          />
        )}
      </main>
    </>
  );
}

export default function Page({ params }: PageProps<"/resumes/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Builder params={params} />
    </Suspense>
  );
}
