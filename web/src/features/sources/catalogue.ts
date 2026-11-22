/**
 * Every job source the app knows about. Client components import this file, so it
 * holds no implementations; see registry.ts for those.
 */
export const sourceCatalogue = [
  { id: "indeed", label: "Indeed Canada", status: "available" },
  { id: "linkedin", label: "LinkedIn", status: "available" },
  { id: "jobbank", label: "Job Bank", status: "available" },
  { id: "alberta", label: "Government of Alberta", status: "available" },
  { id: "greenhouse", label: "Greenhouse company boards", status: "available" },
  { id: "lever", label: "Lever company boards", status: "available" },
  { id: "ashby", label: "Ashby company boards", status: "available" },
  { id: "ahs", label: "Alberta Health Services and Recovery Alberta", status: "coming_soon" },
  { id: "gcjobs", label: "GC Jobs (federal government)", status: "available" },
  { id: "calgary", label: "City of Calgary", status: "coming_soon" },
  { id: "workday", label: "Workday company boards", status: "coming_soon" },
] as const;

export type SourceId = (typeof sourceCatalogue)[number]["id"];
export type AvailableSourceId = Extract<
  (typeof sourceCatalogue)[number],
  { status: "available" }
>["id"];

export const availableSourceIds = sourceCatalogue
  .filter((s) => s.status === "available")
  .map((s) => s.id) as AvailableSourceId[];

export function sourceLabel(id: string): string {
  return sourceCatalogue.find((s) => s.id === id)?.label ?? id;
}
