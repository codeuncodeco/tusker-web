/**
 * Turns a route's server exports into client ones, so its loader, action and
 * middleware run in the browser over the browser database. `vite-plugin.ts`
 * rewrites every route module to call these, and the route files stay as they
 * are on `main`.
 */

import { UNSAFE_ErrorResponseImpl as ErrorResponseImpl } from "react-router";

type Args = { request: Request; [key: string]: unknown };
type Fn = (args: Args) => unknown;
type Middleware = (args: Args, next: () => Promise<unknown>) => unknown;

export function clientLoader(loader: Fn) {
  return (args: Args) => loader(withCookies(args));
}

/**
 * The action, run here. A route that has a client action of its own, such as
 * `postAndReport`, gets this as its `serverAction`, answering as a server
 * would: the data, a redirect thrown, or an error response thrown.
 */
export function clientAction(action: Fn, own?: (args: Args & { serverAction: () => Promise<unknown> }) => unknown) {
  return (args: Args) => {
    const run = () => action(withCookies(args));
    if (!own) return run();
    return own({ ...args, serverAction: () => asServerAnswer(run) });
  };
}

export function clientMiddleware(middleware: Middleware[], own: Middleware[] = []) {
  return [...middleware.map((one) => (args: Args, next: () => Promise<unknown>) => one(withCookies(args), next)), ...own];
}

/** The root's loading screen, while the first loaders run. */
export function HydrateFallback() {
  return null;
}

async function asServerAnswer(run: () => unknown): Promise<unknown> {
  let answer: unknown;
  try {
    answer = await run();
  } catch (failure) {
    if (failure instanceof Response && !isRedirect(failure)) {
      throw new ErrorResponseImpl(failure.status, failure.statusText, await body(failure));
    }
    throw failure;
  }
  if (answer instanceof Response) {
    if (isRedirect(answer)) throw answer;
    return body(answer);
  }
  if (isDataWithInit(answer)) return answer.data;
  return answer;
}

function isRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

async function body(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!(response.headers.get("content-type") ?? "").includes("json")) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isDataWithInit(value: unknown): value is { data: unknown } {
  return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "DataWithResponseInit";
}

/**
 * The request with the browser's cookies in its `cookie` header, as a server
 * would read it. A browser drops `cookie` from a `Request`, but not from a
 * free-standing `Headers`, so the request is wrapped rather than rebuilt.
 */
function withCookies(args: Args): Args {
  if (typeof document === "undefined" || !document.cookie) return args;
  const request = args.request;
  const headers = new Headers(request.headers);
  headers.set("cookie", document.cookie);
  const wrapped = new Proxy(request, {
    get(target, name) {
      if (name === "headers") return headers;
      const value = Reflect.get(target, name, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { ...args, request: wrapped };
}
