import type { Packet } from "@/features/autofill/packet";

/**
 * What a form field asks for, read from its label and attributes. Pure, so it can be
 * tested against labels from real forms.
 */
export type FieldKey =
  | "firstName"
  | "lastName"
  | "fullName"
  | "preferredName"
  | "email"
  | "phone"
  | "city"
  | "province"
  | "country"
  | "location"
  | "linkedin"
  | "github"
  | "website"
  | "resume"
  | "coverLetterFile"
  | "coverLetterText"
  | "currentCompany"
  | "currentTitle"
  | "salary"
  | "workAuthorized"
  | "needsSponsorship"
  | "willingToRelocate"
  | "notice"
  | "howHeard"
  | "pronouns"
  | "gender"
  | "ethnicity"
  | "hispanic"
  | "veteran"
  | "disability"
  | "consent";

export type FieldHint = {
  label: string;
  /** name, id, autocomplete and site-specific attributes, joined. */
  attributes: string;
  kind: "text" | "textarea" | "select" | "radio" | "checkbox" | "file" | "combobox";
};

const autocompleteKeys: Record<string, FieldKey> = {
  "given-name": "firstName",
  "family-name": "lastName",
  name: "fullName",
  email: "email",
  tel: "phone",
  "tel-national": "phone",
  "address-level2": "city",
  "address-level1": "province",
  country: "country",
  "country-name": "country",
  "organization-title": "currentTitle",
  organization: "currentCompany",
};

/** Ordered: the first rule whose pattern matches wins, so specific rules come first. */
const rules: [FieldKey, RegExp][] = [
  ["consent", /\b(i (agree|consent|acknowledge|certify|confirm)|privacy (policy|notice)|terms)\b/],
  ["resume", /\b(resume|cv|curriculum)\b/],
  ["coverLetterText", /\bcover ?letter\b/],
  ["linkedin", /linked ?in/],
  ["github", /git ?hub/],
  ["website", /\b(website|portfolio|personal (site|url|page)|blog)\b/],
  ["preferredName", /\b(preferred|nick) ?(first )?name\b/],
  ["firstName", /\b(first|given|fore) ?name\b|\bfname\b|firstname/],
  ["lastName", /\b(last|family|sur) ?name\b|\blname\b|lastname|surname/],
  ["fullName", /\b(full|legal|your) name\b|^name$|^name\b/],
  ["email", /\be-?mail\b/],
  ["phone", /\b(phone|mobile|cell|telephone)\b/],
  ["needsSponsorship", /\bsponsor(ship)?\b|\bvisa\b/],
  [
    "workAuthorized",
    /\b(legally )?(authori[sz]ed|eligible|entitled|permitted) to work\b|\beligibility to work\b|\bwork (authori[sz]ation|permit|eligibility)\b|right to work/,
  ],
  ["willingToRelocate", /\breloca/],
  [
    "notice",
    /\bnotice( period)?\b|\b(earliest|available|availability to) start\b|\bstart date\b|\bwhen can you start\b/,
  ],
  [
    "salary",
    /\b(salary|compensation|pay|wage|rate) (expectation|requirement|range|desired)|\bexpected (salary|compensation|pay)\b|\bdesired (salary|compensation|pay)\b/,
  ],
  [
    "howHeard",
    /\bhow did you (hear|find|learn)\b|\b(referral )?source\b|\bwhere did you (hear|find)\b/,
  ],
  ["pronouns", /\bpronouns?\b/],
  ["hispanic", /\bhispanic|latin[oax]\b/],
  ["ethnicity", /\b(race|racial|ethnic(ity)?|indigenous|visible minority|aboriginal)\b/],
  ["veteran", /\bveteran|military|armed forces\b/],
  ["disability", /\bdisabilit/],
  ["gender", /\bgender|\bsex\b/],
  [
    "currentCompany",
    /\b(current|present|most recent) (company|employer|organi[sz]ation)\b|^company$|^employer$/,
  ],
  ["currentTitle", /\b(current|present|most recent) (job )?(title|position|role)\b/],
  ["country", /\bcountry\b/],
  ["province", /\b(province|state|region)\b/],
  ["city", /\bcity\b|\btown\b/],
  ["location", /\blocation\b|\bwhere (are you|do you) (located|live|based)\b|\baddress\b/],
];

/** Keys a form asks for in a few words; a long question mentioning them is something else. */
const shortOnly = new Set<FieldKey>([
  "firstName",
  "lastName",
  "fullName",
  "preferredName",
  "email",
  "phone",
  "city",
  "province",
  "country",
  "location",
  "linkedin",
  "github",
  "website",
  "currentCompany",
  "currentTitle",
  "coverLetterText",
]);

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[_\-[\].]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[*✱]|\(required\)|\(optional\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function classify(hint: FieldHint, autocomplete = ""): FieldKey | null {
  const byAutocomplete =
    autocompleteKeys[autocomplete.trim().toLowerCase().split(/\s+/).pop() ?? ""];
  if (byAutocomplete) return byAutocomplete;
  const label = normalize(hint.label);
  // A long question that mentions "current employer" isn't asking for the employer's name.
  const words = label.split(" ").length;
  const longQuestion = hint.kind !== "file" && words > 8 && (label.includes("?") || words > 14);
  // A label is what the member reads, so it decides; attributes are a fallback.
  for (const text of [label, normalize(hint.attributes)]) {
    if (!text) continue;
    // Street addresses and postal codes aren't in the profile.
    if (/\b(address line|street|postal|zip|apt|suite)\b/.test(text)) return null;
    for (const [key, pattern] of rules) {
      if (!pattern.test(text)) continue;
      if (longQuestion && shortOnly.has(key)) continue;
      // "Other website" wants a second link, not the portfolio again.
      if (key === "website" && /\bother\b/.test(text)) return null;
      // A cover letter can be a file or a text box.
      if (key === "coverLetterText" && hint.kind === "file") return "coverLetterFile";
      if (key === "resume" && hint.kind !== "file") {
        // "Paste your resume" boxes are left alone; the PDF is the resume.
        return null;
      }
      return key;
    }
  }
  return null;
}

/** Labels match a saved answer by their words alone, as the server keys them. */
export function questionKey(question: string): string {
  return question
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(required\)|\(optional\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** A yes or no, or a choice the form must offer, rather than free text. */
export type Answer =
  | { type: "text"; value: string }
  | { type: "yesNo"; value: boolean }
  | { type: "decline" }
  | { type: "file"; kind: "resume" | "cover_letter" };

/** What to put in a field the classifier recognised, or null to leave it for the member. */
export function answerFor(key: FieldKey, packet: Packet): Answer | null {
  const c = packet.contact;
  const s = packet.standard;
  const text = (value: string | undefined | null): Answer | null =>
    value ? { type: "text", value } : null;
  const yesNo = (value: boolean | null): Answer | null =>
    value === null ? null : { type: "yesNo", value };
  const selfId = (value: string): Answer => (value ? { type: "text", value } : { type: "decline" });
  switch (key) {
    case "firstName":
      return text(c.firstName);
    case "lastName":
      return text(c.lastName);
    case "fullName":
      return text(c.fullName);
    case "preferredName":
      return text(c.firstName);
    case "email":
      return text(c.email);
    case "phone":
      return text(c.phone);
    case "city":
      return text(c.city);
    case "province":
      return text(c.province);
    case "country":
      return text(c.country);
    case "location":
      return text([c.city, c.province, c.country].filter(Boolean).join(", ") || c.location);
    case "linkedin":
      return text(c.linkedin);
    case "github":
      return text(c.github);
    case "website":
      return text(c.website);
    case "resume":
      return packet.documents.resume ? { type: "file", kind: "resume" } : null;
    case "coverLetterFile":
      return packet.documents.coverLetter ? { type: "file", kind: "cover_letter" } : null;
    case "coverLetterText":
      return text(packet.documents.coverLetter?.text);
    case "currentCompany":
      return text(packet.currentRole?.company);
    case "currentTitle":
      return text(packet.currentRole?.title);
    case "salary":
      return text(s.salaryExpectation);
    case "workAuthorized":
      return yesNo(s.workAuthorized);
    case "needsSponsorship":
      return yesNo(s.needsSponsorship);
    case "willingToRelocate":
      return yesNo(s.willingToRelocate);
    case "notice":
      return text(s.noticePeriod);
    case "howHeard":
      return text(s.howHeard);
    case "pronouns":
      return selfId(s.pronouns);
    case "gender":
      return selfId(s.gender);
    case "ethnicity":
    case "hispanic":
      return selfId(s.ethnicity);
    case "veteran":
      return selfId(s.veteran);
    case "disability":
      return selfId(s.disability);
    // Agreeing to an employer's terms is the member's own decision.
    case "consent":
      return null;
  }
}

const declinePattern =
  /decline|prefer not|don.?t (wish|want)|not to (say|answer|disclose|self|identify)|choose not|rather not|i don.?t know|no answer/i;

/**
 * The option to choose for an answer, from a select's or radio group's choices, or null
 * when none fits. Exact text first, then the meaning of yes, no and "prefer not to say".
 */
export function pickOption(options: string[], answer: Answer): string | null {
  const clean = options
    .map((o) => o.trim())
    .filter((o) => o && !/^(select|choose|please select|--)/i.test(o));
  const find = (test: (o: string) => boolean) => clean.find(test) ?? null;
  switch (answer.type) {
    case "yesNo":
      return answer.value
        ? (find((o) => /^yes\b/i.test(o)) ??
            find((o) => /\b(i am|i do|i have|authori[sz]ed)\b/i.test(o) && !/\bnot\b/i.test(o)))
        : (find((o) => /^no\b/i.test(o)) ?? find((o) => /\b(not|do not|don.?t)\b/i.test(o)));
    case "decline":
      return find((o) => declinePattern.test(o));
    case "text": {
      const want = answer.value.trim().toLowerCase();
      return (
        find((o) => o.toLowerCase() === want) ??
        find((o) => o.toLowerCase().startsWith(want)) ??
        find((o) => want.length >= 3 && o.toLowerCase().includes(want)) ??
        find((o) => o.length >= 3 && want.includes(o.toLowerCase()))
      );
    }
    case "file":
      return null;
  }
}
