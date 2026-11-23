import type { StandardAnswers } from "@/db/schema";
import { parsePlace, provinceName } from "@/lib/places";

/**
 * Everything the extension needs to fill one application form (ADR 0005), and nothing
 * more: contact details, the application's approved documents, standard and saved answers.
 * Pure and free of database imports, so the extension can share the type.
 */
export type Packet = {
  sessionId: string;
  expiresAt: string;
  job: { title: string; company: string; applyUrl: string };
  contact: {
    fullName: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    location: string;
    city: string;
    province: string;
    provinceCode: string;
    country: string;
    linkedin: string;
    github: string;
    website: string;
    otherLinks: { label: string; url: string }[];
  };
  /** The member's current role, from their profile, for "current employer" questions. */
  currentRole: { title: string; company: string } | null;
  standard: StandardAnswers;
  saved: { key: string; question: string; answer: string }[];
  documents: {
    resume: { fileName: string } | null;
    coverLetter: { fileName: string; text: string } | null;
  };
};

/** Pure: "Mary Ann Smith" → first "Mary", last "Ann Smith"; one word is a first name. */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { firstName: "", lastName: "" };
  return { firstName: words[0] ?? "", lastName: words.slice(1).join(" ") };
}

/** Pure: the city, province and country a typed location names, as far as it says. */
export function splitLocation(location: string): {
  city: string;
  province: string;
  provinceCode: string;
  country: string;
} {
  const place = parsePlace(location);
  if (!place) return { city: "", province: "", provinceCode: "", country: "" };
  switch (place.kind) {
    case "city":
      return {
        city: place.city,
        province: place.province ? provinceName(place.province) : "",
        provinceCode: place.province ?? "",
        country: place.province ? "Canada" : "",
      };
    case "province":
      return {
        city: "",
        province: provinceName(place.province),
        provinceCode: place.province,
        country: "Canada",
      };
    case "country":
      return { city: "", province: "", provinceCode: "", country: place.country };
  }
}

/** Pure: sorts contact links into the ones forms ask for by name, and the rest. */
export function sortLinks(links: { label: string; url: string }[]): {
  linkedin: string;
  github: string;
  website: string;
  otherLinks: { label: string; url: string }[];
} {
  const hostOf = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };
  let linkedin = "";
  let github = "";
  let website = "";
  const otherLinks: { label: string; url: string }[] = [];
  for (const link of links) {
    const host = hostOf(link.url);
    if (!linkedin && host.endsWith("linkedin.com")) linkedin = link.url;
    else if (!github && host === "github.com") github = link.url;
    else if (!website && !/(^|\.)(twitter|x|facebook|instagram)\.com$/.test(host))
      website = link.url;
    else otherLinks.push(link);
  }
  return { linkedin, github, website, otherLinks };
}

const atsHosts = /(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|workday\.com)$/;

/**
 * Pure: which posting to open for applying, and the address of its form. An employer's
 * own application system is preferred over a job board that reposted the job.
 */
export function applyUrlFor(postingUrls: string[]): string | null {
  const parsed = postingUrls.flatMap((u) => {
    try {
      return [new URL(u)];
    } catch {
      return [];
    }
  });
  const direct = parsed.find((u) => atsHosts.test(u.hostname));
  const chosen = direct ?? parsed[0];
  if (!chosen) return null;
  const url = new URL(chosen.toString());
  // Lever and Ashby put the form on its own page beside the description.
  if (url.hostname === "jobs.lever.co" && !/\/apply\/?$/.test(url.pathname))
    url.pathname = `${url.pathname.replace(/\/$/, "")}/apply`;
  if (url.hostname === "jobs.ashbyhq.com" && !/\/application\/?$/.test(url.pathname))
    url.pathname = `${url.pathname.replace(/\/$/, "")}/application`;
  return url.toString();
}
