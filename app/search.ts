/**
 * The board's search: one more narrowing beside the filters, not a screen of
 * its own. It rides in the query string, so a narrowed board is linkable and
 * Back works, and the loader does the match in SQL.
 *
 * This module reads the address. The SQL lives in `tasks.server.ts`, and what
 * a board remembers lives in `remembered.ts`.
 */

/** The name the search rides under in the address. */
export const SEARCH_NAME = "q";

/**
 * The text the box holds, with the space around it dropped. A box that holds
 * space and nothing else narrows nothing, as an empty one does.
 */
export function readSearch(params: URLSearchParams): string {
  return (params.get(SEARCH_NAME) ?? "").trim();
}

/**
 * The rest of the address, as name and value pairs. The search box posts these
 * back as hidden fields, so a search keeps the board as it stands rather than
 * resetting the columns a person turned on.
 */
export function withoutSearch(params: URLSearchParams): [string, string][] {
  return [...params].filter(([name]) => name !== SEARCH_NAME);
}
