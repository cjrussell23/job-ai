/**
 * Job identity (ADR 0001): two postings are the same job when their normalized
 * company, title and location match. Normalizing is deliberately conservative:
 * it removes noise (case, punctuation, legal suffixes, province spellings) but
 * keeps words that change the role, such as seniority.
 */

const legalSuffixes =
  /\b(inc|incorporated|ltd|limited|llc|llp|corp|corporation|co|company|ulc|lp|plc|gmbh)\b\.?/g;

const provinces: Record<string, string> = {
  alberta: "ab",
  "british columbia": "bc",
  saskatchewan: "sk",
  manitoba: "mb",
  ontario: "on",
  quebec: "qc",
  québec: "qc",
  "nova scotia": "ns",
  "new brunswick": "nb",
  "newfoundland and labrador": "nl",
  "prince edward island": "pe",
  yukon: "yt",
  "northwest territories": "nt",
  nunavut: "nu",
};

function basic(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompany(company: string): string {
  return basic(company).replace(legalSuffixes, "").replace(/\s+/g, " ").trim();
}

export function normalizeTitle(title: string): string {
  return (
    basic(title)
      // Requisition numbers and bracketed extras ("(Remote)", "- 12345") vary between boards.
      .replace(/\b(req|job|requisition)?\s*#?\d{4,}\b/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function normalizeLocation(location: string): string {
  let value = basic(location.replace(/\bcanada\b/i, ""));
  for (const [name, code] of Object.entries(provinces)) {
    value = value.replace(new RegExp(`\\b${name}\\b`, "g"), code);
  }
  return value.replace(/\s+/g, " ").trim();
}

export function identityKey(job: { company: string; title: string; location: string }): string {
  return [
    normalizeCompany(job.company),
    normalizeTitle(job.title),
    normalizeLocation(job.location),
  ].join("|");
}
