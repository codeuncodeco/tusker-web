/**
 * The board's search: one more narrowing beside the filters, not a screen of
 * its own. It rides in the query string, so a narrowed board is linkable and
 * Back works, and the loader does the work in SQL.
 */

/** The query string name the search rides in. */
export const SEARCH_QUERY = "q";

/**
 * The text the box holds, with the space around it dropped. A box that holds
 * space and nothing else narrows nothing, as an empty one does.
 */
export function readSearch(params: URLSearchParams): string {
  return (params.get(SEARCH_QUERY) ?? "").trim();
}

/** The character the LIKE clause names as its escape. */
export const LIKE_ESCAPE = "\\";

/**
 * The LIKE pattern that finds the text anywhere in a column.
 *
 * A `%`, a `_` or a `\` is a character a person typed and means to find, not a
 * wildcard, so each one is escaped. The clause that binds this must name
 * `ESCAPE '\'`, or SQLite reads the backslash as a plain character.
 */
export function likeAnywhere(text: string): string {
  return `%${text.replace(/[\\%_]/g, (one) => LIKE_ESCAPE + one)}%`;
}

/**
 * The names a board remembers across loads. They are the narrowings, and only
 * those: a column toggle says what a person wants to see, and it is read from
 * the address every time. The filters join this list when they land.
 */
const REMEMBERED = [SEARCH_QUERY];

/** Where one board keeps the narrowing it was left with. */
export function memoryKey(slug: string): string {
  return `tusker:board:${slug}`;
}

/**
 * The narrowing part of a query string, as the query string to remember. An
 * empty answer is a board a person cleared by hand, and it is remembered as
 * cleared.
 */
export function narrowingOf(params: URLSearchParams): string {
  const kept = new URLSearchParams();
  for (const name of REMEMBERED) {
    for (const value of params.getAll(name)) if (value) kept.append(name, value);
  }
  return kept.toString();
}

/**
 * The rest of the query string, as name and value pairs. The search box posts
 * these back as hidden fields, so searching keeps the board as it stands
 * rather than resetting the toggles.
 */
export function withoutSearch(params: URLSearchParams): [string, string][] {
  return [...params].filter(([name]) => name !== SEARCH_QUERY);
}
