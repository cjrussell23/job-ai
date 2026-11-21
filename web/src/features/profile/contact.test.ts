import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { closeDb } from "@/db/client";
import { resetDb } from "@/test/db";
import { createMember } from "@/test/fixtures";
import { documentHeader, getContact, headerFrom, linkText, saveContact } from "./contact";

beforeEach(resetDb);
afterAll(closeDb);

const blank = { fullName: "", email: "", phone: "", location: "", links: [] };

describe("contact details", () => {
  test("the header falls back to the Google account for blank fields", () => {
    expect(headerFrom(undefined, { name: "Ann", email: "a@example.com" })).toEqual({
      name: "Ann",
      contact: "a@example.com",
      links: [],
    });
    expect(
      headerFrom(
        { ...blank, fullName: "Ann Lee", phone: "403-555-0100", location: "Calgary, AB" },
        { name: "Ann", email: "a@example.com" },
      ).contact,
    ).toBe("a@example.com · 403-555-0100 · Calgary, AB");
  });

  test("links are stored as full web addresses and printed without the protocol", async () => {
    const userId = await createMember("a@example.com");
    expect(
      await saveContact(userId, {
        ...blank,
        links: [{ label: "LinkedIn", url: "linkedin.com/in/ann/" }],
      }),
    ).toEqual({ ok: true });
    const contact = await getContact(userId);
    expect(contact?.links).toEqual([{ label: "LinkedIn", url: "https://linkedin.com/in/ann/" }]);
    expect(linkText({ label: "", url: "https://www.linkedin.com/in/ann/" })).toBe(
      "linkedin.com/in/ann",
    );
    const bad = await saveContact(userId, {
      ...blank,
      links: [{ label: "x", url: "javascript:alert(1)" }],
    });
    expect(bad.ok).toBe(false);
    expect(await saveContact(userId, { ...blank, email: "not an email" })).toMatchObject({
      ok: false,
      field: "email",
    });
  });

  test("one member cannot read another's contact details", async () => {
    const userId = await createMember("a@example.com");
    await saveContact(userId, { ...blank, phone: "403-555-0100" });
    const other = await createMember("b@example.com");
    expect(await getContact(other)).toBeUndefined();
    expect((await documentHeader(other)).contact).toBe("b@example.com");
  });
});
