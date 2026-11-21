import type { ItemType } from "./profile";

/** Which fields each item type shows, and what they are called. */
export const itemFields: Record<
  ItemType,
  {
    label: string;
    title?: string;
    organization?: string;
    dates?: boolean;
    content?: string;
    alternateTitles?: string;
    shortContent?: string;
    url?: string;
  }
> = {
  role: {
    label: "Role",
    title: "Job title",
    organization: "Employer",
    dates: true,
    content: "Summary (optional)",
    alternateTitles: "Other titles for this job (one per line, optional)",
  },
  project: {
    label: "Project",
    title: "Project name",
    organization: "For (optional)",
    dates: true,
    content: "Description",
    url: "Link (optional)",
  },
  skill: { label: "Skill", title: "Skill" },
  certification: {
    label: "Certification or education",
    title: "Name",
    organization: "Issued by",
    dates: true,
  },
  story: { label: "Story", title: "Title", content: "What happened, and what you did" },
  note: { label: "Note", content: "Note" },
  bullet: {
    label: "Bullet",
    content: "Bullet",
    shortContent: "Short version (optional, for tight resumes)",
  },
  summary: {
    label: "Summary",
    title: "Name (only you see it)",
    content: "A two or three sentence summary for the top of a resume",
  },
};

export const sectionOrder: { type: Exclude<ItemType, "bullet">; heading: string }[] = [
  { type: "summary", heading: "Summaries" },
  { type: "role", heading: "Roles" },
  { type: "project", heading: "Projects" },
  { type: "skill", heading: "Skills" },
  { type: "certification", heading: "Certifications and education" },
  { type: "story", heading: "Stories" },
  { type: "note", heading: "Notes" },
];

export const visibilityLabels = {
  auto: "Let tailoring decide",
  always: "Always include",
  never: "Never include",
  cover_letter_only: "Cover letter only",
} as const;
