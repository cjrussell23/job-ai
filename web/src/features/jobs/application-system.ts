/** The application system behind a posting link, recorded for auto-apply later. */
const patterns: [RegExp, string][] = [
  [/(^|\.)greenhouse\.io$/, "greenhouse"],
  [/(^|\.)lever\.co$/, "lever"],
  [/(^|\.)ashbyhq\.com$/, "ashby"],
  [/(^|\.)myworkdayjobs\.com$/, "workday"],
  [/(^|\.)taleo\.net$/, "taleo"],
  [/(^|\.)successfactors\.(com|eu)$/, "successfactors"],
  [/(^|\.)smartrecruiters\.com$/, "smartrecruiters"],
  [/(^|\.)bamboohr\.com$/, "bamboohr"],
  [/(^|\.)icims\.com$/, "icims"],
  [/(^|\.)jobbank\.gc\.ca$/, "jobbank"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)indeed\.com$/, "indeed"],
];

export function applicationSystem(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [pattern, name] of patterns) {
    if (pattern.test(host)) return name;
  }
  return null;
}

/** Job boards are where a job is found, not where it is applied to. */
export const aggregatorSystems = new Set(["linkedin", "indeed", "jobbank"]);
