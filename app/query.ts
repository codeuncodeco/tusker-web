/**
 * The two things every narrowing does to the address it rides in: read its own
 * value out, and hand back the rest.
 *
 * The search box and the assignee filter are both GET forms, and each carries
 * the whole of the other's address as hidden fields. That is what makes the
 * narrowings stack: picking a member keeps the search, the chip and the
 * columns a person turned on. Each narrowing names its own parameter and
 * states its own meaning; these two lines are all they share.
 */

/** One value, with the space around it dropped. An absent name reads empty. */
export function readTrimmed(params: URLSearchParams, name: string): string {
  return (params.get(name) ?? "").trim();
}

/** The rest of the address, as name and value pairs, for the hidden fields. */
export function without(params: URLSearchParams, name: string): [string, string][] {
  return [...params].filter(([one]) => one !== name);
}
