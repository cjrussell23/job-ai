"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/features/members/session";
import { requestCompanyProfile } from "./company-profiles";

export async function lookUpCompanyAction(form: FormData): Promise<void> {
  await requireMember();
  const company = z.string().trim().min(1).max(300).safeParse(form.get("company"));
  const jobId = z.uuid().safeParse(form.get("jobId"));
  if (!company.success) return;
  await requestCompanyProfile(company.data);
  if (jobId.success) revalidatePath(`/jobs/${jobId.data}`);
}
