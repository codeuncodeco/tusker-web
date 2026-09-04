import { useLocation } from "react-router";

import { withoutPrompt } from "./decisions";

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
 * `Enter` opens a task from four keyed lists, and the task page has to know
 * which one to give back. The origin travels in the URL and not in a cookie,
 * so it survives a reload and two tabs cannot fight over it.
 */
const FROM = "from";

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
 * The origin a link out of this page records: the page the person stands on,
 * path and query.
 *
 * The query stays, because a board narrowed to today is the page they came
 * from and the page they go back to. The decision prompt is the one part that
 * goes: it is a raised prompt and not a view, and a task already finished must
 * not be asked about again on the way back. See ADR-0010.
 */
export function useOrigin(): string {
  const { pathname, search } = useLocation();
  return withoutPrompt(pathname, search);
}
