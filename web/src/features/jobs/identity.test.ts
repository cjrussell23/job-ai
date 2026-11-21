import { describe, expect, test } from "vitest";
import { applicationSystem } from "./application-system";
import { identityKey, normalizeCompany, normalizeLocation, normalizeTitle } from "./identity";

describe("identity", () => {
  test("company names lose case, punctuation and legal suffixes", () => {
    expect(normalizeCompany("Acme Software, Inc.")).toBe("acme software");
    expect(normalizeCompany("ACME SOFTWARE LTD")).toBe("acme software");
    expect(normalizeCompany("Ross & Co.")).toBe("ross and");
  });

  test("titles keep seniority but drop requisition numbers", () => {
    expect(normalizeTitle("Senior Software Engineer - Req #104233")).toBe(
      "senior software engineer",
    );
    expect(normalizeTitle("Software Engineer")).not.toBe(
      normalizeTitle("Senior Software Engineer"),
    );
    expect(normalizeTitle("C# / .NET Developer")).toBe("c# / net developer");
  });

  test("locations treat province names and codes alike and drop Canada", () => {
    expect(normalizeLocation("Calgary, Alberta, Canada")).toBe("calgary ab");
    expect(normalizeLocation("Calgary, AB")).toBe("calgary ab");
  });

  test("the same role on two boards has the same key", () => {
    const indeed = {
      company: "Acme Software Inc.",
      title: "Backend Developer",
      location: "Calgary, AB",
    };
    const careers = {
      company: "Acme Software",
      title: "Backend Developer (12345)",
      location: "Calgary, Alberta",
    };
    expect(identityKey(indeed)).toBe(identityKey(careers));
  });
});

test("application systems are read from posting links", () => {
  expect(applicationSystem("https://boards.greenhouse.io/acme/jobs/123")).toBe("greenhouse");
  expect(applicationSystem("https://jobs.lever.co/acme/abc")).toBe("lever");
  expect(applicationSystem("https://acme.wd3.myworkdayjobs.com/en-US/careers/job/x")).toBe(
    "workday",
  );
  expect(applicationSystem("https://ca.indeed.com/viewjob?jk=1")).toBe("indeed");
  expect(applicationSystem("https://example.com/careers")).toBeNull();
  expect(applicationSystem("not a url")).toBeNull();
});
