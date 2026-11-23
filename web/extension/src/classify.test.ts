import { describe, expect, test } from "vitest";
import { answerFor, classify, type FieldHint, pickOption } from "./classify";
import { samplePacket } from "./sample-packet";

const text = (label: string, attributes = ""): FieldHint => ({ label, attributes, kind: "text" });

describe("classify", () => {
  test("reads common labels", () => {
    expect(classify(text("First Name"))).toBe("firstName");
    expect(classify(text("Legal last name *"))).toBe("lastName");
    expect(classify(text("Full name✱"))).toBe("fullName");
    expect(classify(text("Email address"))).toBe("email");
    expect(classify(text("Mobile phone"))).toBe("phone");
    expect(classify(text("LinkedIn Profile"))).toBe("linkedin");
    expect(classify(text("Portfolio URL"))).toBe("website");
    expect(classify(text("Other website"))).toBeNull();
    expect(classify(text("Location (City)"))).toBe("city");
    expect(classify(text("Current company"))).toBe("currentCompany");
  });

  test("autocomplete wins, and attributes are a fallback", () => {
    expect(classify(text("Name"), "given-name")).toBe("firstName");
    expect(classify(text("", "legalNameSection_lastName"))).toBe("lastName");
  });

  test("tells sponsorship from work authorization", () => {
    expect(
      classify(
        text(
          "Will you now or in the future require visa sponsorship to maintain work authorization?",
        ),
      ),
    ).toBe("needsSponsorship");
    expect(classify(text("Are you legally authorized to work in Canada?"))).toBe("workAuthorized");
    expect(classify(text("Are you located and have eligibility to work within Canada?"))).toBe(
      "workAuthorized",
    );
  });

  test("a long question that mentions an employer isn't the employer field", () => {
    expect(
      classify(
        text(
          "Are you subject to any employment agreements or restrictions with your current employer?",
        ),
      ),
    ).toBeNull();
  });

  test("leaves consent and street addresses to the member", () => {
    expect(classify(text("I agree to the privacy policy"))).toBe("consent");
    expect(answerFor("consent", samplePacket)).toBeNull();
    expect(classify(text("Address line 1"))).toBeNull();
  });

  test("files are resumes or cover letters only when labelled so", () => {
    expect(classify({ label: "Resume/CV", attributes: "", kind: "file" })).toBe("resume");
    expect(classify({ label: "Cover letter", attributes: "", kind: "file" })).toBe(
      "coverLetterFile",
    );
    expect(classify(text("Paste your resume"))).toBeNull();
  });
});

describe("answers", () => {
  test("come from the packet, and blank standard answers stay blank", () => {
    expect(answerFor("firstName", samplePacket)).toEqual({ type: "text", value: "Jane" });
    expect(answerFor("location", samplePacket)).toEqual({
      type: "text",
      value: "Calgary, Alberta, Canada",
    });
    expect(answerFor("workAuthorized", samplePacket)).toEqual({ type: "yesNo", value: true });
    expect(answerFor("willingToRelocate", samplePacket)).toBeNull();
    expect(answerFor("salary", samplePacket)).toBeNull();
    expect(answerFor("gender", samplePacket)).toEqual({ type: "decline" });
  });

  test("pick the option that means the answer", () => {
    expect(pickOption(["Select...", "Yes", "No"], { type: "yesNo", value: true })).toBe("Yes");
    expect(
      pickOption(["Yes, I'm located in Canada and eligible", "No, I'm not"], {
        type: "yesNo",
        value: false,
      }),
    ).toBe("No, I'm not");
    expect(pickOption(["Male", "Female", "Decline To Self Identify"], { type: "decline" })).toBe(
      "Decline To Self Identify",
    );
    expect(pickOption(["Male", "Female"], { type: "decline" })).toBeNull();
    expect(
      pickOption(["Calgary, Alberta, Canada", "Calgary, NS"], { type: "text", value: "Calgary" }),
    ).toBe("Calgary, Alberta, Canada");
  });
});
