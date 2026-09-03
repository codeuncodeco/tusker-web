import { useLocation } from "react-router";

/**
 * A path inside the app, so a redirect cannot be pointed at another site.
 *
 * The fallback is the unified board. A person who signed in without asking for
 * a page lands on their work, the same answer `/` gives.
 */
export function safeNext(value: unknown, fallback = "/me"): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}

/**
 * The query key a task page carries its origin in.
 *
 * `Enter` opens a task from four lists, and the task page has to know which
 * one to give back. The origin travels in the URL and not in a cookie, so it
 * survives a reload and two tabs cannot fight over it.
 */
export const FROM = "from";

/** One task, opened from the page named by `from`. */
export function taskPath(slug: string, taskId: string, from?: string): string {
  const path = `/o/${slug}/t/${taskId}`;
  return from ? `${path}?${FROM}=${encodeURIComponent(from)}` : path;
}

/**
 * Where a task page goes back to: the list it was opened from, or the org's
 * board for a task opened from nowhere.
 *
 * The origin is a path inside the app and nothing else, because the address
 * bar is where it comes from.
 */
export function backPath(search: string, slug: string): string {
  return safeNext(new URLSearchParams(search).get(FROM), `/o/${slug}/board`);
}

/**
 * The page a person stands on, path and query, as a link out of it records
 * the origin. The query stays: a board narrowed to today is the page they
 * came from, and it is the page they go back to.
 */
export function useHere(): string {
  const { pathname, search } = useLocation();
  return `${pathname}${search}`;
}
