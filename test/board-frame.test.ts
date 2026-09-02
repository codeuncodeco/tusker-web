/**
 * The board frame, read off the two board sources.
 *
 * The frame is layout and nothing else: no loader answers differently and no
 * row changes, so there is nothing to assert against a rendered page that is
 * not already a class string. These read the files, as `design-tokens.test.ts`
 * does, and a manual check at three widths covers the rest.
 */

import { expect, it } from "vitest";

const sources = import.meta.glob("../app/**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The two boards, which are one layout on purpose and so change together. */
const BOARDS = ["routes/board.tsx", "unified-board.tsx"];

/** The class strings of one file, so a word in prose never counts as a class. */
function classes(source: string): string[] {
  return [...source.matchAll(/className=(?:"([^"\n]*)"|\{`([^`]*)`\})/gs)].map(
    (match) => match[1] ?? match[2],
  );
}

/** One file's source, by the tail of its path. */
function sourceOf(name: string): string {
  const found = Object.entries(sources).find(([path]) => path.endsWith(`/${name}`));
  if (!found) throw new Error(`No source at ${name}`);
  return found[1];
}

/** Every class name one file writes, flattened. */
function names(name: string): string[] {
  return classes(sourceOf(name)).flatMap((one) => one.split(/\s+/)).filter(Boolean);
}

it("leaves no board column at a fixed width", () => {
  // `w-72 shrink-0` is what wasted the width: five narrow columns and an empty
  // strip. The minimum is now a floor the column grows off, not a size.
  for (const board of BOARDS) {
    expect([board, names(board).filter((one) => one === "w-72" || one === "shrink-0")]).toEqual([
      board,
      [],
    ]);
  }
});

it("gives every board column an equal share and a floor", () => {
  for (const board of BOARDS) {
    expect([board, names(board).includes("flex-1")]).toEqual([board, true]);
    expect([board, names(board).includes("min-w-72")]).toEqual([board, true]);
  }
});

it("names the frame on both boards", () => {
  // The row holds still and the card list scrolls inside itself. The gutter is
  // reserved so a full column is the same width as an empty one, which is the
  // point of the equal split.
  for (const board of BOARDS) {
    for (const one of ["sm:min-h-0", "sm:overflow-y-auto", "[scrollbar-gutter:stable]"]) {
      expect([board, one, names(board).includes(one)]).toEqual([board, one, true]);
    }
  }
});

it("declares the frame on the two board routes, and on no other route", () => {
  // The layouts hold the height, and they read this handle to know which page
  // asked for it. A page that does not ask keeps document scroll.
  const declaring = Object.entries(sources)
    .filter(([, source]) => /export const handle = \{ frame: true \}/.test(source))
    .map(([path]) => path.split("/").slice(-2).join("/"));
  expect(declaring.sort()).toEqual(["routes/board.tsx", "routes/me.tsx"]);
});
