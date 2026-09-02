/**
 * What a board remembers across loads.
 *
 * The narrowing is the person's, not the org's, so the browser holds it. The
 * address stays the truth while a person is on the board: this only fills the
 * address in when a board is opened with none.
 */

import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { memoryKey, narrowingOf } from "./search";

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
