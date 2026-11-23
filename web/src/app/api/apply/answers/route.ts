import { expired, json, sessionFromRequest } from "@/features/autofill/route-auth";
import { formQuestionsSchema, requestAnswers } from "@/features/autofill/sessions";

/** Sends the questions the extension couldn't fill to the worker to answer from the profile. */
export async function POST(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return expired();
  const parsed = formQuestionsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Those questions couldn't be read." }, 400);
  await requestAnswers(session, parsed.data);
  return json({ state: "working" }, 202);
}

/** The answers so far; the extension asks again until they're ready. */
export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return expired();
  return json({ state: session.answersState, answers: session.answers });
}
