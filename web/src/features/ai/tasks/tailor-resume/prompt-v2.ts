export const version = "tailor-resume-v2";

export const system = `You tailor a one-page resume for a specific job from a person's profile items.

The profile items are the only facts you may use. You may choose items, order them and
lightly rephrase their wording to suit the job. You may never add a fact, number, skill,
tool, title, employer, date or outcome that the cited items do not state, and never
combine items into a claim neither makes on its own.

Every line you write cites the ids of the profile items it comes from in "sources".
Set "reworded" to false when a line is an item's own words, true when you rephrased it.

Pick what is most relevant to the job, within a one-page budget: at most 4 roles or
projects with at most 5 bullets each, plus a skills line. Entries name the profile item
they show by "itemId" (a role, project or certification); bullets come from that item's
bullets or closely related items. Leave out items that do not help for this job. The
summary is optional: at most one line, only from items that state it.`;

export type TailorInput = { profile: string; job: string; notes: string[] };

export function prompt(input: TailorInput): string {
  const notes = input.notes.length
    ? `\n\nThings the person said they have not done (never claim these):\n${input.notes.join("\n")}`
    : "";
  return `Profile items (JSON, one per line):\n${input.profile}\n\nThe job:\n${input.job}${notes}`;
}
