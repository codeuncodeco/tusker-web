/**
 * The remembered narrowing: the search a board was left with, and the filters
 * beside it once they land.
 *
 * It belongs to the person and not to the org, so the browser holds it, one
 * entry per org. The current org takes a cookie instead, because the header is
 * server rendered and a wrong first frame there is a wrong page. A board is
 * not that: the address is the truth, and this only fills it in when a board
 * is opened with none.
 */

import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { readSearch, SEARCH_NAME } from "./search";

/** Where one board keeps the narrowing it was left with. */
export function memoryKey(slug: string): string {
  return `tusker:board:${slug}`;
}

/**
 * The narrowing part of an address, as the query string to remember. A column
 * toggle stays out: it says what a person wants to see, and the address is
 * read for it every time. The filters join this when they land.
 *
 * An empty answer is a board a person cleared by hand, and it is remembered as
 * cleared.
 */
export function narrowingOf(params: URLSearchParams): string {
  const search = readSearch(params);
  return search ? new URLSearchParams({ [SEARCH_NAME]: search }).toString() : "";
}

/** Reads one board's remembered narrowing. A browser that refuses holds none. */
function recall(slug: string): string | null {
  try {
    return localStorage.getItem(memoryKey(slug));
  } catch {
    return null;
  }
}

/** Keeps one board's narrowing, or gives up quietly when the browser refuses. */
function keep(slug: string, narrowing: string) {
  try {
    localStorage.setItem(memoryKey(slug), narrowing);
  } catch {
    // A browser that stores nothing still draws the board.
  }
}

/**
 * Remembers the narrowing a board carries, and gives it back to a board opened
 * with no query at all.
 *
 * A query in the address is the person's word on this board, empty search and
 * all, so it is kept as it stands: a search cleared by hand stays cleared. A
 * board opened bare is the one that asks for the last narrowing, and the
 * address is rewritten in place, so Back leaves the board rather than
 * bouncing.
 */
export function useRemembered(slug: string) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const query = params.toString();

  useEffect(() => {
    if (query) {
      keep(slug, narrowingOf(new URLSearchParams(query)));
      return;
    }

    const remembered = recall(slug);
    if (remembered) navigate(`?${remembered}`, { replace: true });
  }, [slug, query, navigate]);
}
