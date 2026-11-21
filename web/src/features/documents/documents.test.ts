import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { jobs } from "@/db/schema";
import { ingestPostings } from "@/features/jobs/ingest";
import { createItem, listItems } from "@/features/profile/profile";
import { parsePostings } from "@/features/sources/source";
import { resetDb } from "@/test/db";
import { fakeModel } from "@/test/fake-model";
import { createMember } from "@/test/fixtures";
import { type CoverLetterBody, documentBodySchema, type ResumeBody } from "./body";
import {
  approveDocument,
  approvedDocumentsForJob,
  getDocument,
  reconcileEdits,
  saveEdits,
  startDocument,
} from "./documents";
import { generateDocument } from "./generate";
import { renderDocument } from "./render";

let restore = () => {};
beforeEach(resetDb);
afterEach(() => restore());
afterAll(closeDb);

const src = "00000000-0000-4000-8000-000000000001";
const letter = (): CoverLetterBody => ({
  kind: "cover_letter",
  name: "Jane",
  contact: "jane@example.com",
  links: [],
  greeting: "Dear Hiring Team,",
  paragraphs: [
    { id: "p1", text: "I built the billing API.", sources: [src], origin: "reworded" },
    { id: "p2", text: "I'm applying for the role.", sources: [], origin: "reworded" },
  ],
  closing: "Sincerely,",
});

describe("reconciling edits", () => {
  test("sources come from the stored document; new lines are the member's own", () => {
    const stored = letter();
    const edited = letter();
    edited.paragraphs = [
      { id: "p1", text: "I designed and built the billing API.", sources: [], origin: "profile" },
      { id: "p2", text: "I'm applying for the role.", sources: [src], origin: "profile" },
      { id: "new-x", text: "I led a team of 20.", sources: [src], origin: "profile" },
    ];
    const result = reconcileEdits(stored, edited);
    if (result.kind !== "cover_letter") throw new Error("wrong kind");
    expect(result.paragraphs.map((p) => [p.text, p.sources, p.origin])).toEqual([
      ["I designed and built the billing API.", [src], "edited"],
      // An unchanged line keeps its stored sources and origin, whatever the request says.
      ["I'm applying for the role.", [], "reworded"],
      ["I led a team of 20.", [], "user_written"],
    ]);
  });
});

async function memberWithJobAndProfile() {
  const userId = await createMember("a@example.com");
  const role = await createItem(userId, {
    type: "role",
    title: "Software Developer",
    organization: "Acme",
    startDate: "2023",
  });
  if (!role.ok) throw new Error("role not created");
  await createItem(userId, { type: "bullet", parentId: role.id, content: "Built the billing API" });
  await createItem(userId, { type: "skill", title: "TypeScript" });
  await createItem(userId, { type: "note", content: "Private note", visibility: "never" });
  const { postings } = parsePostings([
    {
      url: "https://ca.indeed.com/viewjob?jk=1",
      title: "Backend Developer",
      company: "Beta",
      location: "Calgary, AB",
      description: "APIs.",
    },
  ]);
  await ingestPostings("indeed", postings);
  const [job] = await db().select().from(jobs);
  if (!job) throw new Error("job missing");
  return { userId, jobId: job.id, items: await listItems(userId) };
}

describe("generating, editing and approving", () => {
  test("a tailored resume is written from profile items only, then edited and approved", async () => {
    const { userId, jobId, items } = await memberWithJobAndProfile();
    const role = items.find((i) => i.type === "role");
    const bullet = items.find((i) => i.type === "bullet");
    const skill = items.find((i) => i.type === "skill");
    const secret = items.find((i) => i.type === "note");
    const fake = fakeModel({
      summary: [],
      sections: [
        {
          heading: "Experience",
          entries: [
            {
              itemId: role?.id,
              bullets: [
                { text: "Built the billing API", sources: [bullet?.id], reworded: false },
                { text: "Has a private note", sources: [secret?.id], reworded: true },
              ],
            },
          ],
        },
      ],
      skills: [{ text: "TypeScript", sources: [skill?.id], reworded: false }],
    });
    restore = fake.restore;

    const documentId = await startDocument(userId, jobId, "resume");
    await generateDocument(userId, documentId, jobId, "resume");

    // The never-include note was neither sent to the model nor kept.
    expect(JSON.stringify(fake.calls[0]?.prompt)).not.toContain("Private note");
    const doc = await getDocument(userId, documentId);
    const body = documentBodySchema.parse(doc?.body) as ResumeBody;
    expect(doc?.state).toBe("draft");
    expect(body.sections[0]?.entries[0]).toMatchObject({
      title: "Software Developer",
      subtitle: "Acme",
    });
    expect(body.sections[0]?.entries[0]?.lines.map((l) => l.text)).toEqual([
      "Built the billing API",
    ]);

    // Only approved documents count for an application.
    expect(await approvedDocumentsForJob(userId, jobId)).toHaveLength(0);
    expect(await approveDocument(userId, documentId)).toEqual({ ok: true });
    expect(await approvedDocumentsForJob(userId, jobId)).toHaveLength(1);

    // Any edit returns it to draft.
    const edited = structuredClone(body);
    const firstLine = edited.sections[0]?.entries[0]?.lines[0];
    if (firstLine) firstLine.text = "Built and ran the billing API";
    expect(await saveEdits(userId, documentId, edited)).toEqual({ ok: true });
    expect((await getDocument(userId, documentId))?.state).toBe("draft");
  });

  test("a cover letter is written, and another member cannot read or edit it", async () => {
    const { userId, jobId, items } = await memberWithJobAndProfile();
    const bullet = items.find((i) => i.type === "bullet");
    restore = fakeModel({
      greeting: "Dear Hiring Team,",
      paragraphs: [
        { text: "I'm applying for the Backend Developer role at Beta.", sources: [] },
        { text: "At Acme I built the billing API.", sources: [bullet?.id] },
      ],
      closing: "Sincerely,",
    }).restore;
    const documentId = await startDocument(userId, jobId, "cover_letter");
    await generateDocument(userId, documentId, jobId, "cover_letter");
    const doc = await getDocument(userId, documentId);
    expect(doc?.state).toBe("draft");

    const other = await createMember("b@example.com");
    expect(await getDocument(other, documentId)).toBeUndefined();
    expect(await saveEdits(other, documentId, doc?.body)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await approveDocument(other, documentId)).toEqual({ ok: false, reason: "not_found" });
  });

  test("an empty profile fails with a readable reason and no model call", async () => {
    const userId = await createMember("a@example.com");
    const { postings } = parsePostings([
      {
        url: "https://ca.indeed.com/viewjob?jk=2",
        title: "Dev",
        company: "Beta",
        location: "Calgary, AB",
      },
    ]);
    await ingestPostings("indeed", postings);
    const [job] = await db().select().from(jobs);
    const fake = fakeModel({});
    restore = fake.restore;
    const documentId = await startDocument(userId, job?.id ?? "", "resume");
    await generateDocument(userId, documentId, job?.id ?? "", "resume");
    expect(await getDocument(userId, documentId)).toMatchObject({ state: "failed" });
    expect(fake.calls).toHaveLength(0);
  });
});

test("rendered documents escape what the member typed", () => {
  const body = letter();
  const first = body.paragraphs[0];
  if (first) first.text = '<script>alert("x")</script> & co';
  const html = renderDocument(body);
  expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co");
  expect(html).not.toContain("<script>");
});
