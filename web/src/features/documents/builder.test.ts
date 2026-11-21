import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { closeDb, db } from "@/db/client";
import { documents } from "@/db/schema";
import { createItem, listItems } from "@/features/profile/profile";
import { bulletStrength, entryStrength } from "@/features/profile/strength";
import { createTarget } from "@/features/targets/targets";
import { resetDb } from "@/test/db";
import { fakeModel } from "@/test/fake-model";
import { createMember } from "@/test/fixtures";
import { resumeBodySchema } from "./body";
import { fitSuggestions } from "./guidance";
import { layoutSchema } from "./layout";
import { cleanPicks, pickForTarget } from "./pick";
import { groupEntries, renderResume, renderResumeText } from "./render";
import { duplicateStandingResume, getStandingResume, saveStandingResume } from "./standing";
import { buildStandingBody } from "./standing-body";

let restore = () => {};
beforeEach(resetDb);
afterEach(() => restore());
afterAll(closeDb);

const header = { name: "Ann Lee", contact: "a@example.com", links: [] };

async function career(userId: string) {
  const make = async (input: Record<string, unknown>) => {
    const r = await createItem(userId, input);
    if (!r.ok) throw new Error(`item: ${r.reason}`);
    return r.id;
  };
  const senior = await make({
    type: "role",
    title: "Senior Developer",
    alternateTitles: ["DevOps Administrator"],
    organization: "Acme",
    startDate: "Jan 2026",
    endDate: "Present",
  });
  const junior = await make({
    type: "role",
    title: "Developer",
    organization: "Acme",
    startDate: "Jan 2023",
    endDate: "Dec 2025",
  });
  const b1 = await make({
    type: "bullet",
    parentId: senior,
    content: "Built a billing system that cut invoice errors by 40% across 3,000 accounts.",
    shortContent: "Built billing that cut invoice errors 40%.",
  });
  const b2 = await make({
    type: "bullet",
    parentId: junior,
    content: "Wrote the reporting tools.",
  });
  const site = await make({ type: "project", title: "Blog", url: "blog.example.com" });
  const summary = await make({
    type: "summary",
    title: "Developer",
    content: "Developer with four years building internal systems.",
  });
  return { senior, junior, b1, b2, site, summary };
}

describe("resume builder", () => {
  test("titles, short bullets, links, summary, order and grouping come from the profile", async () => {
    const userId = await createMember("a@example.com");
    const ids = await career(userId);
    const items = await listItems(userId);
    expect(items.find((i) => i.id === ids.site)?.url).toBe("https://blog.example.com");
    const layout = layoutSchema.parse({
      titles: { [ids.senior]: "DevOps Administrator", [ids.junior]: "Made Up Title" },
      short: [ids.b1],
      summaryId: ids.summary,
      itemOrder: [ids.junior, ids.senior],
      headings: { personalProjects: "Side projects" },
    });
    const body = buildStandingBody(items, new Set(items.map((i) => i.id)), header, layout);
    const [experience, projects] = body.sections;
    expect(experience?.entries.map((e) => e.title)).toEqual(["Developer", "DevOps Administrator"]);
    expect(experience?.entries[1]?.lines[0]?.text).toBe(
      "Built billing that cut invoice errors 40%.",
    );
    expect(experience?.entries[1]?.lines[0]?.sources).toEqual([ids.b1]);
    expect(projects?.heading).toBe("Side projects");
    expect(projects?.entries[0]?.url).toBe("https://blog.example.com");
    expect(body.summary.map((l) => l.sources)).toEqual([[ids.summary]]);

    expect(groupEntries(experience?.entries ?? []).map((g) => g.length)).toEqual([2]);
    const html = renderResume(body, { layout });
    expect(html.match(/>Acme</g)).toHaveLength(1);
    expect(html).toContain("Jan 2023 – Present");
    expect(html).toContain('href="https://blog.example.com"');
    const ungrouped = renderResume(body, { layout: { ...layout, groupRoles: false } });
    expect(ungrouped.match(/· Acme/g)).toHaveLength(2);
    expect(renderResume(body, { layout: { ...layout, template: "classic" } })).toContain("Georgia");

    const text = renderResumeText(body);
    expect(text).toContain("EXPERIENCE");
    expect(text).toContain("- Built billing that cut invoice errors 40%.");
    expect(text).not.toContain("<");

    const noDates = buildStandingBody(items, new Set(items.map((i) => i.id)), header, {
      ...layout,
      showDates: false,
    });
    expect(noDates.sections[0]?.entries.every((e) => e.dates === "")).toBe(true);
  });

  test("strength checks and fit suggestions", () => {
    expect(bulletStrength("Responsible for the website").map((a) => a.status)).toContain("warn");
    expect(bulletStrength("Built my dad a website").some((a) => a.message.includes('"I"'))).toBe(
      true,
    );
    expect(bulletStrength("Cut costs by 50% across 30 sites")).toEqual([]);
    expect(entryStrength(["Built a", "Built b", "Built c"])[0]?.message).toContain('"built"');
    expect(
      entryStrength(["Built a", "Lead b", "Wrote c"]).some((a) => a.message.includes("tenses")),
    ).toBe(true);
    expect(entryStrength(["Built a", "Led b", "Wrote c"])).toEqual([]);
    const picked = fitSuggestions(
      [
        { id: "new", text: "x".repeat(90), excess: 0, age: 0 },
        { id: "old", text: "x".repeat(90), excess: 0, age: 8 },
        { id: "over", text: "x".repeat(90), excess: 2, age: 0 },
      ],
      2,
    );
    expect(picked.map((c) => c.id)).toEqual(["over", "old"]);
  });

  test("a resume picked for a target keeps only real items, adds always-include ones, and copies", async () => {
    const userId = await createMember("a@example.com");
    const ids = await career(userId);
    const items = await listItems(userId);
    // A bullet without its role, an unknown id and a summary in the wrong field are dropped.
    expect(cleanPicks(items, [ids.b1, "nope", ids.summary], "nope")).toEqual({
      picked: new Set(),
      summaryId: null,
    });

    const target = await createTarget(userId, {
      roleType: "Developer",
      locations: ["Calgary, AB"],
    });
    if (!target.ok) throw new Error("target");
    const [doc] = await db()
      .insert(documents)
      .values({
        userId,
        kind: "resume",
        standing: true,
        name: "For Developer",
        state: "generating",
      })
      .returning({ id: documents.id });
    if (!doc) throw new Error("doc");
    const fake = fakeModel({ itemIds: [ids.senior, ids.b1, "made-up"], summaryId: ids.summary });
    restore = fake.restore;
    await pickForTarget(userId, doc.id, target.id);
    const saved = await getStandingResume(userId, doc.id);
    expect(saved?.state).toBe("approved");
    const body = resumeBodySchema.parse(saved?.body);
    expect(body.sections[0]?.entries.map((e) => e.title)).toEqual(["Senior Developer"]);
    expect(body.summary).toHaveLength(1);

    const other = await createMember("b@example.com");
    expect(await duplicateStandingResume(other, doc.id)).toEqual({
      ok: false,
      reason: "not_found",
    });
    const copy = await duplicateStandingResume(userId, doc.id);
    if (!copy.ok) throw new Error("copy");
    expect((await getStandingResume(userId, copy.id))?.name).toBe("Copy of For Developer");
  });

  test("saving by hand settles a resume whose pick failed", async () => {
    const userId = await createMember("a@example.com");
    const ids = await career(userId);
    const [doc] = await db()
      .insert(documents)
      .values({ userId, kind: "resume", standing: true, name: "x", state: "failed", failure: "no" })
      .returning({ id: documents.id });
    if (!doc) throw new Error("doc");
    expect(await saveStandingResume(userId, doc.id, "Fixed", [ids.senior])).toEqual({
      ok: true,
      id: doc.id,
    });
    expect((await getStandingResume(userId, doc.id))?.state).toBe("approved");
  });
});

describe("resume header", () => {
  test("links print as labels or addresses, with icons on request", () => {
    const body = resumeBodySchema.parse({
      kind: "resume",
      name: "Ann",
      contact: "a@example.com · Calgary, AB",
      contactParts: [
        { kind: "email", text: "a@example.com" },
        { kind: "location", text: "Calgary, AB" },
      ],
      links: [
        { label: "", url: "https://www.linkedin.com/in/ann/" },
        { label: "My blog", url: "https://blog.example.com" },
        { label: "Bad", url: "javascript:alert(1)" },
      ],
      summary: [],
      sections: [],
      skills: [],
    });
    const plain = renderResume(body);
    expect(plain).toContain(">linkedin.com/in/ann<");
    expect(plain).not.toContain("<svg");
    expect(plain).not.toContain("javascript:");
    const labelled = renderResume(body, {
      layout: layoutSchema.parse({ headerLinks: "label", headerIcons: true }),
    });
    expect(labelled).toContain("LinkedIn</a>");
    expect(labelled).toContain("My blog</a>");
    expect(labelled.match(/<svg/g)).toHaveLength(4);
  });
});
