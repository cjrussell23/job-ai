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
  }
> = {
  role: {
    label: "Role",
    title: "Job title",
    organization: "Employer",
    dates: true,
    content: "Summary (optional)",
  },
  project: {
    label: "Project",
    title: "Project name",
    organization: "For (optional)",
    dates: true,
    content: "Description",
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
  bullet: { label: "Bullet", content: "Bullet" },
};

export const sectionOrder: { type: Exclude<ItemType, "bullet">; heading: string }[] = [
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
