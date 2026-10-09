/**
 * How a board scrolls. See #191.
 *
 * The page scrolls and no column does, and from `sm` up the header and the Top
 * row stick. That is layout, so most of these read class strings: off the two
 * board sources, as `design-tokens.test.ts` does, or off the markup of the
 * header and the Top row. A manual check at three widths covers the rest.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { expect, it } from "vitest";

import { Header } from "../app/header";
import { covered, TopRow, TopRowBox } from "../app/top-row";

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

/** The first class string in one file that holds `wanted`, so a test can read its neighbours. */
function classWith(name: string, wanted: string): string {
  const found = classes(sourceOf(name)).find((each) => each.split(/\s+/).includes(wanted));
  if (!found) throw new Error(`No class with ${wanted} in ${name}`);
  return found;
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

it("gives no card list a scroller of its own", () => {
  // A column is as long as its cards, and the page scrolls. See #191.
  for (const board of BOARDS) {
    const scrolls = names(board).filter((one) => /overflow-y|scrollbar-gutter|min-h-0/.test(one));
    expect([board, scrolls]).toEqual([board, []]);
  }
});

it("leaves no page asking for a frame", () => {
  const declaring = Object.entries(sources)
    .filter(([, source]) => /export const handle|useFrame/.test(source))
    .map(([path]) => path);
  expect(declaring).toEqual([]);
});

/** The class names of the outermost element in some markup. */
function classesIn(markup: string): string[] {
  const found = /^<\w+[^>]* class="([^"]*)"/.exec(markup);
  if (!found) throw new Error(`No class in ${markup}`);
  return found[1].split(/\s+/);
}

it("draws the Top row on both board pages", () => {
  for (const page of ["routes/board.tsx", "routes/me.tsx"]) {
    expect([page, /<TopRow>/.test(sourceOf(page)), /<TopRowBox>/.test(sourceOf(page))]).toEqual([
      page,
      true,
      true,
    ]);
  }
});

it("sticks the Top row under the header from sm up, with a border under it", () => {
  // The header is `h-16`, so the row sticks at `top-16`. Below `sm` nothing
  // sticks, so every sticky class is `sm:`-prefixed.
  const markup = renderToStaticMarkup(createElement(TopRow, null, "x"));
  // The cursor finds the row by this, to keep a card clear of it.
  expect(markup).toMatch(/^<header data-top-row/);
  const row = classesIn(markup);
  for (const one of ["sm:sticky", "sm:top-16", "border-b", "border-border", "bg-bg"]) {
    expect([one, row.includes(one)]).toEqual([one, true]);
  }
  expect(row.includes("sticky")).toBe(false);
});

it("gives the quick-add box all the Top row on a phone, half at sm and a third at lg", () => {
  const box = classesIn(renderToStaticMarkup(createElement(TopRowBox, null, "x")));
  expect(box).toEqual(["w-full", "sm:w-1/2", "lg:w-1/3"]);
});

/** The org the header names on an org page. */
const ACME = { slug: "acme", name: "Acme", color: "blue" as const };

/** The header's own class names, drawn at one address. */
function headerAt(pathname: string): string[] {
  const org = pathname.startsWith("/o/") ? ACME : null;
  const markup = renderToStaticMarkup(
    createElement(StaticRouter, { location: pathname }, createElement(Header, { orgs: [], org })),
  );
  return classesIn(markup);
}

it("sticks the header from sm up on both boards, as tall as the Top row's offset", () => {
  for (const pathname of ["/me", "/o/acme/board"]) {
    const header = headerAt(pathname);
    for (const one of ["sm:sticky", "top-0", "h-16", "bg-bg"]) {
      expect([pathname, one, header.includes(one)]).toEqual([pathname, one, true]);
    }
    expect([pathname, header.includes("sticky")]).toEqual([pathname, false]);
  }
});

it("leaves the header in the page on every page but a board", () => {
  for (const pathname of ["/me/week", "/me/plan", "/account", "/o/acme/members"]) {
    expect([pathname, headerAt(pathname).includes("sm:sticky")]).toEqual([pathname, false]);
  }
});

it("scrolls a card the Top row covers out from under it", () => {
  // The Top row's bottom edge is at 200. A card whose top is at 150 sits 50
  // under it, and a little more keeps it clear of the border.
  expect(covered({ bottom: 200 }, { top: 150 })).toBe(58);
  // A card already below the row needs nothing, and nor does a card under a
  // row that has scrolled away, as it does on a phone.
  expect(covered({ bottom: 200 }, { top: 400 })).toBe(0);
  expect(covered({ bottom: -40 }, { top: 10 })).toBe(0);
});

it("draws no box round a board column", () => {
  // A card is the one thing on the board with an edge. The column is a pane,
  // and only a divider marks where one ends. See #184.
  for (const board of BOARDS) {
    const column = classWith(board, "min-w-72").split(/\s+/);
    const box = column.filter((one) => /^(rounded|border)/.test(one));
    expect([board, box]).toEqual([board, []]);
  }
});

it("splits the board columns with a divider in the token colour", () => {
  // The columns sit in a row at every width, and the row scrolls sideways when
  // it runs out, so the divider between them is upright at every width.
  for (const board of BOARDS) {
    const row = classWith(board, "overflow-x-auto").split(/\s+/);
    expect([board, row.includes("divide-x"), row.includes("divide-border")]).toEqual([
      board,
      true,
      true,
    ]);
  }
});

/** The class names of one board's keyed list, the card list that takes the focus. */
function keyedList(name: string): string[] {
  const found = /props=\{keyed\([^)]*\)\}\s*className="([^"]*)"/.exec(sourceOf(name));
  if (!found) throw new Error(`No keyed list in ${name}`);
  return found[1].split(/\s+/);
}

it("draws the keyed list's focus outline inside it, on both boards", () => {
  // The row scrolls sideways, and a scroll box clips what is outside it. The
  // first column has no left pad and the last no right pad, so an outline
  // drawn outside the card list loses an edge. Inset, it keeps all four. An
  // inset outline on an empty list has no box to draw on, so the list has a
  // floor. See #193.
  for (const board of BOARDS) {
    for (const one of ["focus-visible:-outline-offset-2", "min-h-12"]) {
      expect([board, one, keyedList(board).includes(one)]).toEqual([board, one, true]);
    }
  }
});
