/**
 * Places a job search can cover: a city, a province or territory, or a country. Each
 * is stored as one canonical string ("Calgary, AB", "Alberta", "Canada") so existing
 * text columns keep working, and parsed back with `parsePlace`.
 */

export const provinces = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
] as const;
export type ProvinceCode = (typeof provinces)[number]["code"];

export const countries = ["Canada", "United States"] as const;
export type Country = (typeof countries)[number];

export type Place =
  | { kind: "city"; city: string; province: ProvinceCode | null }
  | { kind: "province"; province: ProvinceCode }
  | { kind: "country"; country: Country };

const clean = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const countryAliases: Record<string, Country> = {
  canada: "Canada",
  ca: "Canada",
  "united states": "United States",
  "united states of america": "United States",
  usa: "United States",
  us: "United States",
};

/** A province or territory code from its code or name, e.g. "ab" or "Alberta". */
export function provinceOf(text: string): ProvinceCode | null {
  const t = clean(text);
  const found = provinces.find((p) => p.code.toLowerCase() === t || clean(p.name) === t);
  return found?.code ?? null;
}

export function provinceName(code: ProvinceCode): string {
  return provinces.find((p) => p.code === code)?.name ?? code;
}

/** Reads a stored or typed place. "Calgary, AB" is a city, "AB" or "Alberta" a province. */
export function parsePlace(text: string): Place | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const country = countryAliases[clean(trimmed)];
  if (country) return { kind: "country", country };
  const province = provinceOf(trimmed);
  if (province) return { kind: "province", province };
  const [cityPart = "", ...rest] = trimmed.split(",").map((s) => s.trim());
  const cityProvince = rest.map(provinceOf).find((p) => p !== null) ?? null;
  if (!clean(cityPart)) return null;
  return { kind: "city", city: cityPart, province: cityProvince };
}

/** The canonical string a place is stored and shown as. */
export function placeLabel(place: Place): string {
  switch (place.kind) {
    case "city":
      return place.province ? `${place.city}, ${place.province}` : place.city;
    case "province":
      return provinceName(place.province);
    case "country":
      return place.country;
  }
}

/** What a job board's location string says, as far as it can be read. */
export function readJobLocation(location: string): {
  city: string;
  province: ProvinceCode | null;
  country: Country | null;
} {
  const parts = location
    .replace(/[()]/g, ",")
    .split(/[,|·-]/)
    .map((p) => p.trim())
    .filter(Boolean);
  let province: ProvinceCode | null = null;
  let country: Country | null = null;
  for (const part of parts) {
    province ??= provinceOf(part);
    country ??= countryAliases[clean(part)] ?? null;
  }
  // A Canadian province means Canada even when the board doesn't say so.
  if (province) country ??= "Canada";
  const first = parts[0] ?? "";
  const firstIsPlaceName = provinceOf(first) !== null || countryAliases[clean(first)] !== undefined;
  const city = firstIsPlaceName || /^remote$/i.test(first) ? "" : clean(first);
  return { city, province, country };
}

/**
 * Whether a job's location is inside a place. A city also needs the province to agree
 * when both are known, so Victoria, BC doesn't match a Victoria elsewhere.
 */
export function placeContains(place: Place, jobLocation: string): boolean {
  const job = readJobLocation(jobLocation);
  switch (place.kind) {
    case "city":
      return (
        job.city !== "" &&
        job.city === clean(place.city) &&
        (place.province === null || job.province === null || job.province === place.province)
      );
    case "province":
      return job.province === place.province;
    case "country":
      return job.country === place.country;
  }
}

/** Whether the location says anything we could check against a place. */
export function locationKnown(jobLocation: string): boolean {
  const job = readJobLocation(jobLocation);
  return job.city !== "" || job.province !== null || job.country !== null;
}

/** The text a job board search uses for a place: "Calgary, AB", "Alberta" or "Canada". */
export function searchText(place: Place): string {
  return placeLabel(place);
}
