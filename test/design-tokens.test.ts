import { expect, it } from "vitest";

// Every component source, as text. The sweep that put the tokens in is only
// done while no component reaches past them, so these read the files rather
// than the rendered page.
const sources = import.meta.glob("../app/**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The class strings of one file, so a word in prose never counts as a class. */
function classes(source: string): string[] {
  return [...source.matchAll(/className=(?:"([^"\n]*)"|\{`([^`]*)`\})/gs)].map(
    (match) => match[1] ?? match[2],
  );
}

/**
 * Asserts that no component names a class the sweep was meant to remove, and
 * names the file and the class when one does.
 */
function expectNoClass(names: (one: string) => boolean, skip: string[] = []): void {
  for (const [path, source] of Object.entries(sources)) {
    if (skip.some((one) => path.endsWith(one))) continue;
    expect([path, classes(source).filter(names)]).toEqual([path, []]);
  }
}

it("leaves no component naming Tailwind's grey ramp", () => {
  expectNoClass((one) => one.includes("neutral-"));
});

it("leaves no `dark:` variant, which the tokens made dead", () => {
  // Each token is a `light-dark()` pair, so it flips itself. A `dark:` variant
  // beside one either repeats it or fights it.
  expectNoClass((one) => one.includes("dark:"));
});

it("leaves no component repeating the body size", () => {
  // `text-sm` is what <body> sets, so saying it again says nothing. The
  // `text-xs` that remain then mean "smaller than body", which is the point of
  // saying it.
  expectNoClass((one) => /\btext-sm\b/.test(one), ["root.tsx"]);
});
