import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { RefreshWhile } from "@/components/refresh-while";
import { SiteHeader } from "@/components/site-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { resumeBodySchema } from "@/features/documents/body";
import { FeedbackPanel } from "@/features/documents/components/feedback-panel";
import { ResumeBuilder } from "@/features/documents/components/resume-builder";
import { readFeedback } from "@/features/documents/feedback";
import { recommendedPages, yearsOfExperience } from "@/features/documents/guidance";
import { readLayout } from "@/features/documents/layout";
import { getStandingResume, pickedItems, resumeItems } from "@/features/documents/standing";
import {
  deleteStandingResumeAction,
  duplicateStandingResumeAction,
} from "@/features/documents/standing-actions";
import type { BuildableItem } from "@/features/documents/standing-body";
import { requireMember } from "@/features/members/session";
import { documentHeader } from "@/features/profile/contact";
import { listItems, type ProfileItem } from "@/features/profile/profile";

const builderTypes = new Set(["role", "project", "certification", "skill", "bullet", "summary"]);

/** Only the fields the builder needs go to the browser. */
function toBuildable(item: ProfileItem): BuildableItem {
  const { id, type, parentId, title, organization, content, shortContent, alternateTitles } = item;
  const { url, startDate, endDate, visibility, position } = item;
  return {
    id,
    type,
    parentId,
    title,
    organization,
    content,
    shortContent,
    alternateTitles,
    url,
    startDate,
    endDate,
    visibility,
    position,
  };
}

async function Builder({ params }: { params: PageProps<"/resumes/[id]">["params"] }) {
  const { userId, name, member } = await requireMember();
  const { id } = await params;
  const isNew = id === "new";
  const doc = isNew ? undefined : await getStandingResume(userId, id);
  if (!isNew && !doc) notFound();
  const body = resumeBodySchema.safeParse(doc?.body);
  const [all, header] = await Promise.all([listItems(userId), documentHeader(userId)]);
  const items = resumeItems(all)
    .filter((i) => builderTypes.has(i.type))
    .map(toBuildable);
  const years = yearsOfExperience(items.filter((i) => i.type === "role").map((i) => i.startDate));
  // A new resume starts with everything picked; trimming is easier than building up.
  const picked = body.success ? [...pickedItems(body.data)] : items.map((i) => i.id);

  return (
    <>
      <SiteHeader name={name} isAdmin={member.role === "admin"} />
      <RefreshWhile active={doc?.state === "generating"} />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10">
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
          {doc?.body != null && doc.state === "approved" && (
            <div className="flex flex-wrap gap-2">
              <a
                href={`/documents/${doc.id}/docx`}
                className={buttonVariants({ variant: "outline" })}
              >
                Word
              </a>
              <a
                href={`/documents/${doc.id}/text`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                Plain text
              </a>
              <form action={duplicateStandingResumeAction}>
                <input type="hidden" name="id" value={doc.id} />
                <Button type="submit" variant="outline">
                  Duplicate
                </Button>
              </form>
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
        {doc?.state === "failed" && (
          <p role="alert" className="text-sm text-destructive">
            {doc.failure} Pick the items yourself below and save.
          </p>
        )}
        {doc?.state === "generating" ? (
          <p className="text-sm text-muted-foreground">
            Picking the items that fit this target… this takes under a minute.
          </p>
        ) : items.length === 0 ? (
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
            layout={readLayout(doc?.layout)}
            header={header}
            recommendedPages={recommendedPages(years)}
            yearsOfExperience={years}
            feedback={
              doc?.state === "approved" ? (
                <FeedbackPanel version={doc.version} feedback={readFeedback(doc.feedback)} />
              ) : undefined
            }
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
