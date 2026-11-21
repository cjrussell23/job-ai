import { listItems, type ProfileItem } from "./profile";

const dates = (item: ProfileItem) => [item.startDate, item.endDate].filter(Boolean).join(" to ");

/**
 * The master profile as plain text for scoring profile fit. Items marked "never
 * include" are left out; nothing else is added or changed.
 */
export async function profileForScoring(userId: string): Promise<string> {
  const items = (await listItems(userId)).filter((i) => i.visibility !== "never");
  const bulletsOf = (parentId: string) =>
    items.filter((i) => i.parentId === parentId).map((b) => `  - ${b.content}`);
  const ofType = (type: ProfileItem["type"]) => items.filter((i) => i.type === type);
  const sections: string[] = [];
  const add = (heading: string, lines: string[]) => {
    if (lines.length > 0) sections.push(`${heading}:\n${lines.join("\n")}`);
  };

  add(
    "Roles",
    ofType("role").flatMap((r) => {
      const org = r.organization ? `, ${r.organization}` : "";
      const when = dates(r) ? ` (${dates(r)})` : "";
      const summary = r.content ? `: ${r.content}` : "";
      return [`- ${r.title}${org}${when}${summary}`, ...bulletsOf(r.id)];
    }),
  );
  add(
    "Projects",
    ofType("project").flatMap((p) => [
      `- ${p.title}${p.content ? `: ${p.content}` : ""}`,
      ...bulletsOf(p.id),
    ]),
  );
  const skills = ofType("skill").map((s) => s.title);
  add("Skills", skills.length > 0 ? [skills.join(", ")] : []);
  add(
    "Certifications and education",
    ofType("certification").map((c) => {
      const org = c.organization ? `, ${c.organization}` : "";
      return `- ${c.title}${org}${dates(c) ? ` (${dates(c)})` : ""}`;
    }),
  );
  add(
    "Stories",
    ofType("story").map((s) => `- ${s.title}: ${s.content}`),
  );
  add(
    "Notes",
    ofType("note").map((n) => `- ${n.content}`),
  );
  return sections.join("\n\n") || "(The profile is empty.)";
}
