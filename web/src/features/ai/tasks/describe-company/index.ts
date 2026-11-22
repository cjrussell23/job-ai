import { z } from "zod";
import type { TaskDefinition } from "@/features/ai/task";
import { type DescribeCompanyInput, prompt, system, version } from "./prompt-v1";

const text = (max: number) => z.string().trim().min(1).max(max).nullable().default(null);

const schema = z.object({
  summary: z.string().trim().min(1).max(800),
  industry: text(120),
  employees: text(120),
  headquarters: text(160),
  founded: text(60),
  ownership: text(120),
  website: text(300),
  reviews: z
    .object({
      rating: z.number().min(0).max(10).nullable().default(null),
      outOf: z.number().min(1).max(10).nullable().default(null),
      site: text(80),
      summary: text(400),
    })
    .nullable()
    .default(null),
  notable: z.array(z.string().trim().min(1).max(300)).max(4).default([]),
  sources: z
    .array(z.object({ title: z.string().trim().max(200), url: z.string().trim().max(600) }))
    .max(12)
    .default([]),
  confidence: z.enum(["low", "medium", "high"]),
});
export type CompanyDescription = z.infer<typeof schema>;

export const describeCompany: TaskDefinition<DescribeCompanyInput, CompanyDescription> = {
  name: "describeCompany",
  promptVersion: version,
  schema,
  allowedPastCap: false,
  maxOutputTokens: 4000,
  webSearch: true,
  buildPrompt: (input) => ({ system, prompt: prompt(input) }),
};
