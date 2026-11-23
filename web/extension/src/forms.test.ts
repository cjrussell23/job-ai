// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import { answerFor, classify } from "./classify";
import { collectFields, type Field } from "./fields";
import { fillField } from "./fill";
import { samplePacket } from "./sample-packet";

/** Saved markup of real public application forms; nothing was submitted to save them. */
function load(name: string) {
  document.body.innerHTML = readFileSync(`extension/__fixtures__/${name}.html`, "utf8");
}

async function fillKnown(): Promise<Field[]> {
  const fields = collectFields(document);
  for (const field of fields) {
    if (field.hint.kind === "combobox" || field.hint.kind === "file") continue;
    const key = classify(field.hint, field.autocomplete);
    const answer = key ? answerFor(key, samplePacket) : null;
    if (answer) await fillField(field, answer);
  }
  return fields;
}

const textIn = (label: string) => {
  const field = collectFields(document).find((f) => f.hint.label === label);
  return (field?.element as HTMLInputElement | undefined)?.value;
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("real forms", () => {
  test("Greenhouse", async () => {
    load("greenhouse");
    await fillKnown();
    expect(textIn("First Name")).toBe("Jane");
    expect(textIn("Last Name")).toBe("Q Doe");
    expect(textIn("Email")).toBe("jane@example.com");
    expect(textIn("Phone")).toBe("403-555-0100");
    expect(textIn("LinkedIn Profile")).toBe("https://linkedin.com/in/jane");
  });

  test("Lever, including a radio group without a legend", async () => {
    load("lever");
    const fields = await fillKnown();
    expect(textIn("Full name")).toBe("Jane Q Doe");
    expect(textIn("Current company")).toBe("Initech");
    expect(textIn("GitHub URL")).toBe("https://github.com/jane");
    const eligibility = fields.find((f) => f.hint.label.startsWith("Are you located"));
    expect(eligibility?.group.find((g) => g.checked)?.value).toMatch(/yes/i);
    const heard = fields.find((f) => f.hint.label.startsWith("Where did you hear"));
    expect((heard?.element as HTMLSelectElement | undefined)?.selectedOptions[0]?.text).toBe(
      "Indeed.ca",
    );
  });

  test("Ashby, leaving its fill-from-resume upload alone", async () => {
    load("ashby");
    const fields = await fillKnown();
    expect(textIn("Email")).toBe("jane@example.com");
    const authorized = fields.find((f) => f.hint.label.startsWith("Are you currently legally"));
    expect((authorized?.element as HTMLInputElement | undefined)?.checked).toBe(true);
    const sponsorship = fields.find((f) => f.hint.label.startsWith("Will you now"));
    expect((sponsorship?.element as HTMLInputElement | undefined)?.checked).toBe(false);
    const nameUpload = fields.find((f) => f.hint.kind === "file" && f.hint.label === "Name");
    expect(classify(nameUpload?.hint ?? { label: "", attributes: "", kind: "file" })).not.toBe(
      "resume",
    );
  });
});
