import { expect, test } from "vitest";
import { normalizeEmail, signInDecision } from "./sign-in-decision";

test("an address with no member record is not invited", () => {
  expect(signInDecision(undefined)).toBe("not_invited");
});

test("invited and active members may sign in", () => {
  expect(signInDecision({ state: "invited" })).toBe("allowed");
  expect(signInDecision({ state: "active" })).toBe("allowed");
});

test("suspended members may not", () => {
  expect(signInDecision({ state: "suspended" })).toBe("suspended");
});

test("emails compare case-insensitively", () => {
  expect(normalizeEmail("  Jane.Doe@Gmail.com ")).toBe("jane.doe@gmail.com");
});
