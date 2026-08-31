/**
 * A reference field points at a record in an org app. This module holds the
 * shape of what the org app answers with, so the reader and the tests state
 * the same contract once.
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
