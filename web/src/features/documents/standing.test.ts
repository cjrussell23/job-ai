import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { jobs } from "@/db/schema";
import { attachDocument, trackJob } from "@/features/applications/applications";
import { ingestPostings } from "@/features/jobs/ingest";
import { createItem, listItems } from "@/features/profile/profile";
import { parsePostings } from "@/features/sources/source";
import { resetDb } from "@/test/db";
import { createMember } from "@/test/fixtures";
import { allLines, resumeBodySchema } from "./body";
import { documentsForJob } from "./documents";
import { renderResume } from "./render";
import {
  deleteStandingResume,
  getStandingResume,
  listStandingResumes,
  pickedItems,
  saveStandingResume,
} from "./standing";

beforeEach(resetDb);
afterAll(closeDb);

async function profile(userId: string) {
  const role = await createItem(userId, { type: "role", title: "Analyst", organization: "Acme" });
  if (!role.ok) throw new Error("no role");
  const kept = await createItem(userId, {
    type: "bullet",
    parentId: role.id,
    content: "Built reports",
  });
  const dropped = await createItem(userId, {
    type: "bullet",
    parentId: role.id,
    content: "Filed papers",
  });
  const skill = await createItem(userId, { type: "skill", title: "SQL" });
  const hidden = await createItem(userId, { type: "skill", title: "Secret", visibility: "never" });
  if (!kept.ok || !dropped.ok || !skill.ok || !hidden.ok) throw new Error("items");
  return {
    roleId: role.id,
    keptId: kept.id,
    droppedId: dropped.id,
    skillId: skill.id,
    hiddenId: hidden.id,
  };
}

describe("standing resumes", () => {
  test("a standing resume shows only picked items, in their own words, and counts as approved", async () => {
    const userId = await createMember("a@example.com");
    const ids = await profile(userId);
    const saved = await saveStandingResume(userId, null, "Data roles", [
      ids.roleId,
      ids.keptId,
      ids.skillId,
      ids.hiddenId,
    ]);
    if (!saved.ok) throw new Error("not saved");
    const doc = await getStandingResume(userId, saved.id);
    expect(doc).toMatchObject({
      state: "approved",
      standing: true,
      jobId: null,
      name: "Data roles",
    });
    const body = resumeBodySchema.parse(doc?.body);
    const lines = allLines(body);
    expect(lines.map((l) => l.text)).toEqual(["Built reports", "SQL"]);
    expect(lines.every((l) => l.origin === "profile" && l.sources.length > 0)).toBe(true);
    // An item marked "never include" stays off even if picked.
    expect(pickedItems(body)).toEqual(new Set([ids.roleId, ids.keptId, ids.skillId]));

    expect(await saveStandingResume(userId, null, " ", [ids.roleId])).toEqual({
      ok: false,
      reason: "invalid_name",
    });
    expect(await saveStandingResume(userId, null, "Empty", [])).toEqual({
      ok: false,
      reason: "nothing_picked",
    });
    // Standing resumes are not a job's tailored documents.
    expect((await listItems(userId)).length).toBe(5);
  });

  test("a standing resume can be attached to any application", async () => {
    const userId = await createMember("a@example.com");
    const ids = await profile(userId);
    const saved = await saveStandingResume(userId, null, "General", [ids.roleId, ids.keptId]);
    if (!saved.ok) throw new Error("not saved");
    const { postings } = parsePostings([
      {
        url: "https://ca.indeed.com/viewjob?jk=5",
        title: "Analyst",
        company: "Beta",
        location: "Calgary, AB",
        description: "x",
      },
    ]);
    await ingestPostings("indeed", postings);
    const [job] = await db().select().from(jobs);
    if (!job) throw new Error("no job");
    expect(await documentsForJob(userId, job.id)).toEqual([]);
    const application = await trackJob(userId, job.id, "applied", null);
    expect(await attachDocument(userId, application.id, saved.id, "resume")).toEqual({ ok: true });
    expect(await attachDocument(userId, application.id, saved.id, "cover_letter")).toEqual({
      ok: false,
      reason: "wrong_kind",
    });
  });

  test("one member cannot see, change or delete another's standing resumes", async () => {
    const userId = await createMember("a@example.com");
    const ids = await profile(userId);
    const saved = await saveStandingResume(userId, null, "Mine", [ids.roleId]);
    if (!saved.ok) throw new Error("not saved");
    const other = await createMember("b@example.com");
    const theirs = await profile(other);
    expect(await listStandingResumes(other)).toEqual([]);
    expect(await getStandingResume(other, saved.id)).toBeUndefined();
    expect(await saveStandingResume(other, saved.id, "Taken", [theirs.roleId])).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteStandingResume(other, saved.id)).toBe(false);
    expect((await getStandingResume(userId, saved.id))?.name).toBe("Mine");
  });

  test("work and personal projects are separate sections, in the member's order", async () => {
    const userId = await createMember("a@example.com");
    const ids = await profile(userId);
    const work = await createItem(userId, {
      type: "project",
      title: "Billing",
      organization: "acme",
    });
    const own = await createItem(userId, { type: "project", title: "Blog" });
    if (!work.ok || !own.ok) throw new Error("items");
    const saved = await saveStandingResume(
      userId,
      null,
      "Ordered",
      [ids.roleId, ids.skillId, work.id, own.id],
      { pages: 2, density: "compact", order: ["skills", "personalProjects"] },
    );
    if (!saved.ok) throw new Error("not saved");
    const doc = await getStandingResume(userId, saved.id);
    expect(doc?.layout).toEqual({
      pages: 2,
      density: "compact",
      order: ["skills", "personalProjects", "experience", "workProjects", "education"],
    });
    const body = resumeBodySchema.parse(doc?.body);
    expect(body.sections.map((s) => s.heading)).toEqual([
      "Personal projects",
      "Experience",
      "Work projects",
    ]);
    expect(body.skillsAt).toBe(0);
    const html = renderResume(body);
    expect(html.indexOf("<h2>Skills</h2>")).toBeLessThan(html.indexOf("Personal projects"));

    expect(await saveStandingResume(userId, null, "Bad", [ids.roleId], { pages: 9 })).toEqual({
      ok: false,
      reason: "invalid_layout",
    });
  });
});
