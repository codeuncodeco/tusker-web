/**
 * How a board scrolls, read off the two board sources.
 *
 * The page scrolls and no column does, and from `sm` up the header and the Top
 * row stick. That is layout and nothing else: no loader answers differently and
 * no row changes, so there is nothing to assert against a rendered page that is
 * not already a class string. These read the files, as `design-tokens.test.ts`
 * does, and a manual check at three widths covers the rest. See #191.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { expect, it } from "vitest";

import { Header } from "../app/header";
import { covered } from "../app/top-row";

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

/** The two board pages, which draw the Top row. */
const PAGES = ["routes/board.tsx", "routes/me.tsx"];

/** The class names of one page's Top row, the element that carries `data-top-row`. */
function topRow(name: string): string[] {
  const found = /<header\s+data-top-row\s+className="([^"]*)"/.exec(sourceOf(name));
  if (!found) throw new Error(`No Top row in ${name}`);
  return found[1].split(/\s+/);
}

it("sticks the Top row under the header from sm up, with a border under it", () => {
  // The header is `h-16`, so the row sticks at `top-16`. Below `sm` nothing
  // sticks, so every sticky class is `sm:`-prefixed.
  for (const page of PAGES) {
    const row = topRow(page);
    for (const one of ["sm:sticky", "sm:top-16", "border-b", "border-border", "bg-bg"]) {
      expect([page, one, row.includes(one)]).toEqual([page, one, true]);
    }
    expect([page, row.includes("sticky")]).toEqual([page, false]);
  }
});

it("gives the add box half the Top row at sm and a third at lg", () => {
  for (const page of PAGES) {
    const box = classWith(page, "sm:w-1/2").split(/\s+/);
    expect([page, box.includes("w-full"), box.includes("lg:w-1/3")]).toEqual([page, true, true]);
    const bounds = box.filter((one) => /^(min-w|max-w)-/.test(one));
    expect([page, bounds]).toEqual([page, []]);
  }
});

/** The org the header names on an org page. */
const ACME = { slug: "acme", name: "Acme", color: "blue" as const };

/** The header's own class names, drawn at one address. */
function headerAt(pathname: string): string[] {
  const org = pathname.startsWith("/o/") ? ACME : null;
  const markup = renderToStaticMarkup(
    createElement(StaticRouter, { location: pathname }, createElement(Header, { orgs: [], org })),
  );
  const found = /<header class="([^"]*)"/.exec(markup);
  if (!found) throw new Error(`No header at ${pathname}`);
  return found[1].split(/\s+/);
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
