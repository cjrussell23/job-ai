import { describe, expect, test } from "vitest";
import { type Atom, paginate } from "./paginate";

const atom = (top: number, height: number, extra: Partial<Atom> = {}): Atom => ({
  top,
  bottom: top + height,
  keepWithNext: false,
  breakBefore: false,
  ...extra,
});

describe("pagination", () => {
  test("breaks before the bullet that does not fit, pulling its headings with it", () => {
    const atoms = [
      atom(0, 300),
      atom(300, 20, { keepWithNext: true }), // section heading
      atom(320, 20, { keepWithNext: true }), // entry head
      atom(340, 100), // first bullet runs past 400
      atom(440, 40),
    ];
    const result = paginate(atoms, 400);
    expect(result.breaks).toEqual([300]);
    expect(result.pages).toBe(2);
    expect(result.overflowPast(1)).toBe(180);
    expect(result.overflowPast(2)).toBe(0);
  });

  test("a section marked to start a new page does, and nothing breaks at a page's top", () => {
    const atoms = [
      atom(0, 50),
      atom(50, 20, { breakBefore: true, keepWithNext: true }),
      atom(70, 600),
    ];
    expect(paginate(atoms, 400).breaks).toEqual([50]);
    expect(paginate([atom(0, 900)], 400).breaks).toEqual([]);
  });
});
