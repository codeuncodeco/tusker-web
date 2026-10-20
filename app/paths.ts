import { useLocation } from "react-router";

import { withoutPrompt } from "./decisions";
import type { TaskId } from "./task-number";

/**
 * A path inside the app, so a redirect cannot be pointed at another site.
 * A browser reads `/\` as `//`, so neither starts one.
 *
 * The fallback is `/`, which sends a signed-in person to the board of their
 * first org. A person who signed in without asking for a page lands on their
 * work. See ADR-0037.
 */
export function safeNext(value: unknown, fallback = "/"): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\")
    ? path
    : fallback;
}

/**
 * The page a request came from. With single fetch, a client-side submit or
 * link goes to the page's data address, `/me.data`, and a redirect there is a
 * 404. The root's data address has two names: `/_root.data` and `/_.data`.
 */
export function pageOf(pathname: string): string {
  if (pathname === "/_root.data" || pathname === "/_.data") return "/";
  return pathname.endsWith(".data") ? pathname.slice(0, -".data".length) : pathname;
}

/** The single-fetch query key that names the loaders to run. */
const SINGLE_FETCH_ROUTES = "_routes";

/**
 * The address a request came from, as the address bar reads it: the page and
 * its query, with no data address and no single-fetch query. Server code reads
 * the page from here and never from `request.url` itself.
 */
export function pageUrl(requestUrl: string): URL {
  const url = new URL(requestUrl);
  url.pathname = pageOf(url.pathname);
  url.searchParams.delete(SINGLE_FETCH_ROUTES);
  return url;
}

/** The same address, as a path and query a redirect can name. */
export function pageAddress(requestUrl: string): string {
  const { pathname, search } = pageUrl(requestUrl);
  return `${pathname}${search}`;
}

/**
 * The query key a task page carries its origin in.
 *
 * `Enter` opens a task from four keyed lists, and the task page has to know
 * which one to give back. The origin travels in the URL and not in a cookie,
 * so it survives a reload and two tabs cannot fight over it.
 */
const FROM = "from";

/**
 * One task, opened from the page named by `from`. The path names the task and
 * no org, so a rename breaks no link to it. See ADR-0030.
 */
export function taskPath(taskId: TaskId, from?: string): string {
  const path = `/t/${taskId}`;
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

/**
 * The pages a task opens over, as a modal, rather than leaving: a board, and
 * the Week, Plan and Focus views. See ADR-0039.
 */
const MODAL_PARENTS = [/^\/o\/[^/]+\/board/, /^\/me\/week/, /^\/me\/plan/, /^\/me\/focus/, /^\/me/];

/**
 * The page a modal at this address opens over: the board or the view the
 * address starts with, or null for a page that stands alone, as `/t/12` does.
 * An org page under a board, `/o/acme/board/clients`, opens over that board.
 */
export function modalParentOf(pathname: string): string | null {
  // The bare `/me/week/2026-W43` and `/me/plan/2026-10-19` pages stand alone:
  // only the view itself holds a modal.
  for (const parent of MODAL_PARENTS) {
    const found = pathname.match(parent)?.[0];
    if (!found) continue;
    const rest = pathname.slice(found.length);
    if (rest === "" || rest.startsWith("/t/") || (found.endsWith("/board") && rest.startsWith("/"))) return found;
    return null;
  }
  return null;
}

/**
 * Where a task opens from this page: as a modal over the board or view the
 * person stands on, keeping its address so the page behind keeps its filters;
 * else its own page, which remembers the way back. See ADR-0039.
 */
export function taskHref(id: TaskId, pathname: string, search: string): string {
  const parent = modalParentOf(pathname);
  const query = new URLSearchParams(search);
  query.delete(FROM);
  const kept = withoutPrompt(parent ?? pathname, query.toString() ? `?${query}` : "");
  return parent ? `${parent}/t/${id}${kept.slice(parent.length)}` : taskPath(id, withoutPrompt(pathname, search));
}

/** The same, read from where the person stands. */
export function useTaskHref(): (id: TaskId) => string {
  const { pathname, search } = useLocation();
  return (id) => taskHref(id, pathname, search);
}

/**
 * Where a task's page goes back to: the board or view it was opened over, with
 * that page's address, or for a task's own page, the list it was opened from.
 */
export function taskBack(url: string, slug: string): string {
  const { pathname, search } = new URL(url);
  const parent = modalParentOf(pathname);
  if (!parent) return backPath(search, slug);
  const query = new URLSearchParams(search);
  query.delete(FROM);
  return `${parent}${query.toString() ? `?${query}` : ""}`;
}

/**
 * Where one page of an org opens: over its board, as a modal, so the board
 * stays behind it. See ADR-0039.
 */
export function orgPagePath(slug: string, page: string): string {
  return `/o/${slug}/board/${page}`;
}
