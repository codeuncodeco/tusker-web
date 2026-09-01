/**
 * A reference field points at a record in an org app. This module holds the
 * shape of what the org app answers with, and the rule that joins the org's
 * base URL to the field's path, so the reader and the tests state the same
 * contract once.
 */

/** One `{id, label}` pair, as a refs endpoint returns it and the cache holds it. */
export type RefOption = { id: string; label: string };

/**
 * The options in what an org app answered, or null when the answer is not a
 * list of `{id, label}` rows.
 *
 * The id is read as text, because an org app that numbers its trails still
 * writes a string into the task's JSON.
 */
export function readRefOptions(body: unknown): RefOption[] | null {
  if (!Array.isArray(body)) return null;

  const options: RefOption[] = [];
  for (const row of body) {
    if (typeof row !== "object" || row === null) return null;
    const { id, label } = row as { id?: unknown; label?: unknown };
    if (typeof id !== "string" && typeof id !== "number") return null;
    if (typeof label !== "string") return null;
    options.push({ id: String(id), label });
  }

  return options;
}

/**
 * True for a base URL Tusker can call: an absolute http or https URL. The org
 * holds one, and it carries the origin and the prefix every refs endpoint of
 * that org app shares.
 */
export function isRefsBaseUrl(text: string): boolean {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

/**
 * True for a path a reference field can name: one or more bare segments, such
 * as `trails`.
 *
 * A path carries no scheme, no `//` prefix and no `..` segment. This is what
 * stops a field sending the org app's key to another host.
 *
 * A per cent sign is refused with the rest. A segment needs no escape, and the
 * URL parser reads `%2e%2e` as `..`, so allowing the escape would let a path
 * climb out of the base by spelling the same segment another way.
 */
export function isRefsPath(text: string): boolean {
  if (!/^[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(text)) return false;
  return !text.split("/").includes("..");
}

/**
 * The URL one reference field reads, or null when the pair does not make one.
 *
 * The joined URL's origin must equal the base's origin. The path rule already
 * refuses everything that could move it, and this is the second reading of the
 * same rule, taken on the URL the key would actually be sent to.
 */
export function refsUrl(base: string, path: string): string | null {
  if (!isRefsBaseUrl(base) || !isRefsPath(path)) return null;

  const origin = new URL(base).origin;
  const joined = new URL(`${base.replace(/\/+$/, "")}/${path}`);
  return joined.origin === origin ? joined.toString() : null;
}

/**
 * The org app one org names, as a screen reads it.
 *
 * The key is missing on purpose: this goes to the browser, and the key opens
 * the org app's data. `has_refs_key` is the only question a screen asks of it,
 * and `refs.server.ts` is the one reader of the key itself.
 */
export type OrgApp = { refs_base_url: string; has_refs_key: boolean };

/**
 * True when the org names both halves of an org app. A reference field reads
 * under an address with a key, so one half is as good as none.
 */
export function isLinked(app: OrgApp): boolean {
  return app.refs_base_url !== "" && app.has_refs_key;
}
