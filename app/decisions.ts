/**
 * Where the decision prompt lives while it is raised: the query string.
 *
 * The prompt is not the answer of the post that finished the task. It is a
 * place, so every way of finishing reaches it — a board card, a row of the
 * unified view, the task page — and a reload before the person answers raises
 * the same prompt again.
 */

/** The task the prompt asks about. */
export const ASK = "ask";

/** The org that holds it, which a cross-org page has no path to read. */
export const ORG = "org";

/** This page with the prompt raised on one task. */
export function withPrompt(
  pathname: string,
  search: string,
  task: { id: string; slug: string },
): string {
  const params = new URLSearchParams(search);
  params.set(ASK, task.id);
  params.set(ORG, task.slug);
  return `${pathname}?${params.toString()}`;
}

/**
 * This page with the prompt gone, which a save and a skip both land on. The
 * rest of the query string stays: a board narrowed to today is still narrowed
 * once the prompt closes.
 */
export function withoutPrompt(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete(ASK);
  params.delete(ORG);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
