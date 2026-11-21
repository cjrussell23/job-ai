export const version = "propose-search-titles-v1";

export const system = `You suggest job titles to search job boards with, for one kind of job a
person wants. Job boards match on the title text, so cover the common ways employers
title this kind of role in Canada, including more and less senior variants only when they
fit the person's experience.

Return between 3 and 8 short titles, most likely first. Use titles employers actually post,
not descriptions. Do not include company names, locations or seniority words the person
did not ask for unless their experience clearly supports them.`;

export function prompt(input: {
  roleType: string;
  note: string;
  roleTitles: string[];
  skills: string[];
}): string {
  const lines = [`The kind of job they want: ${input.roleType}`];
  if (input.note) lines.push(`Their note about it: ${input.note}`);
  if (input.roleTitles.length) lines.push(`Titles they have held: ${input.roleTitles.join("; ")}`);
  if (input.skills.length) lines.push(`Skills: ${input.skills.join(", ")}`);
  return lines.join("\n");
}
