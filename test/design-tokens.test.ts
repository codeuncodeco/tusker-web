import { describe, expect, it } from "vitest";

// Every component source, as text. The sweep that put the tokens in is only
// done while no component reaches past them, so these read the files rather
// than the rendered page.
const sources = import.meta.glob("../app/**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const entries = Object.entries(sources);

/** The class strings of one file, so a word in prose never counts as a class. */
function classes(source: string): string[] {
  return [...source.matchAll(/className=(?:"([^"\n]*)"|\{`([^`]*)`\})/gs)].map(
    (match) => match[1] ?? match[2],
  );
}

describe("the sweep", () => {
  it("finds a component that still names Tailwind's grey ramp", () => {
    for (const [path, source] of entries) {
      expect([path, classes(source).filter((one) => one.includes("neutral-"))]).toEqual([path, []]);
    }
  });

  it("finds a `dark:` variant, which the tokens made dead", () => {
    // Each token is a `light-dark()` pair, so it flips itself. A `dark:`
    // variant beside one either repeats it or fights it.
    for (const [path, source] of entries) {
      expect([path, classes(source).filter((one) => one.includes("dark:"))]).toEqual([path, []]);
    }
  });

  it("finds a component that repeats the body size", () => {
    // `text-sm` is what <body> sets, so saying it again says nothing. The
    // `text-xs` that remain then mean "smaller than body", which is the point
    // of saying it.
    for (const [path, source] of entries) {
      if (path.endsWith("root.tsx")) continue;
      expect([path, classes(source).filter((one) => /\btext-sm\b/.test(one))]).toEqual([path, []]);
    }
  });
});
