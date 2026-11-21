import { expect, test } from "vitest";
import { extractResumeText } from "./extract-text";

const encode = (text: string) => new TextEncoder().encode(text);

test("reads plain text files and tidies blank lines", async () => {
  const result = await extractResumeText({
    name: "cv.txt",
    type: "text/plain",
    bytes: encode(
      "Jane Doe\r\n\r\n\r\n\r\nSoftware engineer with eight years of experience in Calgary.",
    ),
  });
  expect(result).toEqual({
    ok: true,
    text: "Jane Doe\n\nSoftware engineer with eight years of experience in Calgary.",
  });
});

test("refuses unsupported files and files with almost no text", async () => {
  expect(
    await extractResumeText({ name: "cv.png", type: "image/png", bytes: encode("x") }),
  ).toEqual({
    ok: false,
    reason: "unsupported_type",
  });
  expect(
    await extractResumeText({ name: "cv.txt", type: "text/plain", bytes: encode("hi") }),
  ).toEqual({
    ok: false,
    reason: "no_text",
  });
});
