import { describe, expect, test } from "vitest";
import { parsePlace, placeContains, placeLabel, readJobLocation } from "./places";

const contains = (place: string, job: string) => {
  const p = parsePlace(place);
  if (!p) throw new Error(`not a place: ${place}`);
  return placeContains(p, job);
};

describe("places", () => {
  test("typed places read as cities, provinces or countries, in canonical form", () => {
    expect(parsePlace("Calgary, AB")).toEqual({ kind: "city", city: "Calgary", province: "AB" });
    expect(parsePlace("calgary, alberta")).toEqual({
      kind: "city",
      city: "calgary",
      province: "AB",
    });
    expect(parsePlace("Hamilton")).toEqual({ kind: "city", city: "Hamilton", province: null });
    expect(parsePlace("AB")).toEqual({ kind: "province", province: "AB" });
    expect(parsePlace("Ontario")).toEqual({ kind: "province", province: "ON" });
    expect(parsePlace("canada")).toEqual({ kind: "country", country: "Canada" });
    expect(parsePlace("USA")).toEqual({ kind: "country", country: "United States" });
    expect(parsePlace(" ")).toBeNull();
    expect(placeLabel({ kind: "province", province: "AB" })).toBe("Alberta");
  });

  test("job locations are read from the way boards write them", () => {
    expect(readJobLocation("Calgary, Alberta, Canada")).toEqual({
      city: "calgary",
      province: "AB",
      country: "Canada",
    });
    expect(readJobLocation("Toronto (ON)")).toEqual({
      city: "toronto",
      province: "ON",
      country: "Canada",
    });
    expect(readJobLocation("Remote - Canada")).toEqual({
      city: "",
      province: null,
      country: "Canada",
    });
    expect(readJobLocation("Alberta")).toEqual({ city: "", province: "AB", country: "Canada" });
  });

  test("a city, province or country contains the right jobs", () => {
    expect(contains("Calgary, AB", "Calgary, Alberta, Canada")).toBe(true);
    expect(contains("Calgary, AB", "Edmonton, AB")).toBe(false);
    expect(contains("Victoria, BC", "Victoria, TX")).toBe(true); // province unknown on the job
    expect(contains("Victoria, BC", "Victoria, ON")).toBe(false);
    expect(contains("Alberta", "Red Deer, AB")).toBe(true);
    expect(contains("Alberta", "Vancouver, BC")).toBe(false);
    expect(contains("Canada", "Halifax, NS")).toBe(true);
    expect(contains("Canada", "Remote - Canada")).toBe(true);
    expect(contains("United States", "Halifax, NS")).toBe(false);
  });
});
