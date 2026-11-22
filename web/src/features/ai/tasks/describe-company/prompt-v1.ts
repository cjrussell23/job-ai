export const version = "describe-company-v1";

export const system = `You look up a company for a job seeker and describe it from a web search.
Search the web (the company's own site, its LinkedIn page, news, and review sites such as
Glassdoor or Indeed) and write what someone deciding whether to apply would want to know.

Rules:
- State only what the pages you found say. Anything you can't find is null. Never guess.
- Make sure it is the right company: use the location and job titles given. If several
  companies share the name and you can't tell which, say so in the summary and set
  confidence to "low".
- "summary": two or three sentences on what the company does and who for.
- "employees": as the sources put it, e.g. "1,001-5,000 (LinkedIn)" or "about 2,400 (2025 report)".
- "reviews": the rating, its scale and the site it's from, plus one sentence on what reviewers
  commonly say; null if you found no reviews.
- "notable": up to 4 short facts a candidate would care about (recent news, funding,
  layoffs, awards, remote policy), each from a source.
- "sources": the pages you used, with titles and exact URLs.
- "confidence": how sure you are that this is the right company and the facts are current.`;

export type DescribeCompanyInput = { company: string; location: string; jobTitles: string[] };

export function prompt(input: DescribeCompanyInput): string {
  return [
    `Company: ${input.company}`,
    `Where its job postings are: ${input.location || "not stated"}`,
    `Jobs it is hiring for: ${input.jobTitles.join("; ") || "not stated"}`,
  ].join("\n");
}
