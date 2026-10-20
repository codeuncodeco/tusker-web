/**
 * Every page loads over the browser database, through the same rewrite of
 * the route modules and the same module swaps the browser build makes.
 *
 * This runs each page's middleware and loaders the way the client router
 * does, root first. It reads no component, so a page that draws wrong still
 * passes: the browser is where that shows.
 */

import { matchRoutes, RouterContextProvider, type RouteObject } from "react-router";
import initSqlJs from "sql.js";
import { beforeEach, describe, expect, it } from "vitest";

import { cloudflareEnv } from "../app/context.server";
import routes from "../app/routes";
import { openDatabase, type Store } from "./database";
import { toClientExports } from "./vite-plugin";

const SQL = await initSqlJs();
const modules = import.meta.glob<RouteModule>(["../app/root.tsx", "../app/routes/*.{ts,tsx}", "../app/layouts/*.tsx"]);

type Args = { request: Request; params: Record<string, string | undefined>; context: RouterContextProvider };
type RouteModule = {
  clientLoader?: (args: Args) => unknown;
  clientAction?: (args: Args) => unknown;
  clientMiddleware?: ((args: Args, next: () => Promise<unknown>) => unknown)[];
  loader?: unknown;
  action?: unknown;
  middleware?: unknown;
};

type Config = { file: string; path?: string; index?: boolean; children?: Config[] };
type Tree = RouteObject & { handle: { file: string } };

function tree(config: Config[]): Tree[] {
  return config.map((one) => ({
    path: one.path,
    index: one.index,
    handle: { file: one.file },
    children: one.children ? tree(one.children) : undefined,
  })) as Tree[];
}

const ROOT: Tree = { path: "/", handle: { file: "root.tsx" }, children: tree(routes as Config[]) } as Tree;

let env: Env;

beforeEach(async () => {
  let text: string | null = null;
  const store: Store = { load: () => text, save: (t) => (text = t), clear: () => (text = null) };
  const { db } = await openDatabase(SQL, store);
  env = { DB: db, BETTER_AUTH_SECRET: "sandbox", MAIL_FROM: "Tusker <tusker@sandbox.test>" } as Env;
});

/** Loads one page as the client router would, or answers what it threw. */
async function load(path: string, init?: RequestInit): Promise<{ data: unknown[]; thrown?: unknown }> {
  const url = new URL(path, "https://sandbox.test");
  const matches = matchRoutes([ROOT], url.pathname);
  if (!matches) throw new Error(`No route matches ${path}`);

  const context = new RouterContextProvider();
  context.set(cloudflareEnv, env);
  const request = new Request(url, init);
  const params = matches.at(-1)!.params as Record<string, string>;
  const loaded = await Promise.all(
    matches.map(async (match) => modules[`../app/${(match.route as Tree).handle.file}`]!()),
  );

  try {
    for (const one of loaded) {
      for (const middleware of one.clientMiddleware ?? []) await middleware({ request, params, context }, async () => {});
    }
    if (init?.method === "POST") {
      const action = loaded.at(-1)!.clientAction;
      if (!action) throw new Error(`${path} takes no post`);
      return { data: [await action({ request, params, context })] };
    }
    const data = await Promise.all(loaded.map((one) => one.clientLoader?.({ request: request.clone() as Request, params, context })));
    return { data };
  } catch (thrown) {
    return { data: [], thrown };
  }
}

function redirectOf(thrown: unknown): string | null {
  return thrown instanceof Response && thrown.status >= 300 && thrown.status < 400 ? thrown.headers.get("location") : null;
}

describe("the route rewrite", () => {
  it("moves every server export to a client one", async () => {
    for (const [file, load] of Object.entries(modules)) {
      const module = await load();
      expect(module.loader, file).toBeUndefined();
      expect(module.action, file).toBeUndefined();
      expect(module.middleware, file).toBeUndefined();
    }
  });

  it("hands a route's own client action the server action", () => {
    const out = toClientExports(
      "export async function action() {}\nexport const clientAction = (args) => postAndReport(args);\n",
      false,
    );
    expect(out).toContain("async function action()");
    expect(out).not.toContain("export async function action");
    expect(out).toContain("__sandbox.clientAction(action, clientAction)");
  });

  it("leaves a module with no server export alone", () => {
    const code = "export default function Page() {}\n";
    expect(toClientExports(code, false)).toBe(code);
  });
});

describe("every page loads over the browser database", () => {
  const pages = [
    "/me",
    "/me/focus",
    "/me/week",
    "/me/plan",
    "/account",
    "/orgs/new",
    "/o/studio/board",
    // An org's pages open over its board. See ADR-0039.
    "/o/studio/board/fields",
    "/o/studio/board/decisions",
    "/o/studio/board/archive",
    "/o/studio/board/members",
    "/o/studio/board/settings",
    "/o/studio/board/clients",
    "/o/studio/board/t/1",
    "/me/t/1",
    "/o/garden/board",
    "/t/1",
  ];

  for (const page of pages) {
    it(page, async () => {
      const { thrown } = await load(page);
      expect(thrown).toBeUndefined();
    });
  }

  it("sends an org page's old address on to the board it opens over", async () => {
    expect(redirectOf((await load("/o/studio/members?x=1")).thrown)).toBe("/o/studio/board/members?x=1");
  });

  it("sends / to the board of the first org, with no sign-in", async () => {
    expect(redirectOf((await load("/")).thrown)).toBe("/o/studio/board");
  });

  it("sends the sign-in page on, because the person is signed in", async () => {
    expect(redirectOf((await load("/login")).thrown)).toBe("/");
  });

  it("sends a member from the org directory to their board, as on main", async () => {
    expect(redirectOf((await load("/orgs")).thrown)).toBe("/");
  });

  it("shuts the bootstrap page, because the seed made accounts", async () => {
    const { thrown } = await load("/bootstrap");
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
  });

  it("answers a task no org holds with a 404", async () => {
    const { thrown } = await load("/t/9999");
    expect((thrown as Response).status).toBe(404);
  });
});

describe("a post runs its action over the browser database", () => {
  it("invites a person, and mails nobody", async () => {
    const body = new URLSearchParams({ email: "new@sandbox.test" });
    const { data, thrown } = await load("/o/studio/board/members", { method: "POST", body });
    expect(thrown).toBeUndefined();
    expect(data[0]).toMatchObject({ ok: expect.stringContaining("new@sandbox.test") });
    const { results } = await env.DB.prepare('SELECT email FROM "user" WHERE email = ?').bind("new@sandbox.test").all();
    expect(results).toHaveLength(1);
  });
});
