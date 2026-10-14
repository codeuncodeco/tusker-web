/**
 * The build side of the sandbox. Two jobs, so the files under `app/` stay as
 * they are on `main`:
 *
 * 1. Every route module's `loader`, `action` and `middleware` become
 *    `clientLoader`, `clientAction` and `clientMiddleware`, wrapped by
 *    `sandbox/route.ts`. React Router's SPA mode then runs them in the
 *    browser.
 * 2. The modules that reach outside the browser are swapped: the session and
 *    auth for the one seeded person, and Resend for a stub. Every other
 *    `.server` module is data code over the D1 handle, and it ships to the
 *    browser as it is.
 */

import path from "node:path";
import type { Plugin } from "vite";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = path.join(ROOT, "app");
const HERE = path.join(ROOT, "sandbox");

/** The modules the sandbox build swaps, by the file they replace. */
const SWAPS: Record<string, string> = {
  [path.join(APP, "session.server.ts")]: path.join(HERE, "session.ts"),
  [path.join(APP, "auth.server.ts")]: path.join(HERE, "auth.ts"),
};

/** React Router refuses a `.server` module in the browser unless its id says otherwise. */
const BROWSER_SERVER_MODULE = "?sandbox-browser";

export function sandbox(): Plugin {
  return {
    name: "tusker-sandbox",
    // Before React Router reads a route's exports, and before its check that
    // no `.server` module reaches the browser.
    enforce: "pre",

    async resolveId(id, importer, options) {
      if (id === "resend") return path.join(HERE, "resend.ts");
      if (!importer || !/\.server(\.ts)?$/.test(id)) return null;

      const resolved = await this.resolve(id, importer, {
        ...options,
        skipSelf: true,
        // React Router's check would refuse it. The answer below is what lets
        // a data module through.
        custom: { ...options?.custom, "react-router:dot-server": true },
      });
      if (!resolved) return null;
      const file = resolved.id.split("?")[0]!;
      if (SWAPS[file]) return SWAPS[file];
      return options?.ssr ? null : `${file}${BROWSER_SERVER_MODULE}`;
    },

    transform(code, id) {
      const file = id.split("?")[0]!;
      if (!isRouteModule(file)) return null;
      return { code: toClientExports(code, file === path.join(APP, "root.tsx")), map: null };
    },
  };
}

function isRouteModule(file: string): boolean {
  if (!/\.tsx?$/.test(file)) return false;
  const dir = path.dirname(file);
  return file === path.join(APP, "root.tsx") || dir === path.join(APP, "routes") || dir === path.join(APP, "layouts");
}

/**
 * The exports the transform moves, declared as the route files on `main`
 * declare them: `export async function loader` or `export const middleware`.
 *
 * `headers` is moved and then dropped: it sets the headers of a server's
 * document response, and a static page has none.
 */
const MOVED =
  /^export (?:async )?(?:function|const) (loader|action|headers|middleware|clientLoader|clientAction|clientMiddleware)\b/gm;

/**
 * One route module, with its server exports turned into client ones.
 *
 * Each server export loses its `export` and stays as a local, and a tail
 * exports the wrapped client version. The source is TypeScript before any
 * other plugin reads it, so this edits text, and the pattern above matches
 * the only shapes the route files use. A route that declares one some other
 * way fails the SPA build loudly, with React Router's own message.
 */
export function toClientExports(code: string, isRoot: boolean): string {
  const exported = new Set<string>();
  const out = code.replace(MOVED, (match, name: string) => {
    exported.add(name);
    return match.replace(/^export /, "");
  });

  if (exported.size === 0 && !isRoot) return code;

  const tail = ['import * as __sandbox from "/sandbox/route.ts";'];
  if (exported.has("loader")) {
    tail.push(`const __clientLoader = __sandbox.clientLoader(loader);`, `export { __clientLoader as clientLoader };`);
  }
  if (exported.has("action")) {
    const own = exported.has("clientAction") ? ", clientAction" : "";
    tail.push(`const __clientAction = __sandbox.clientAction(action${own});`, `export { __clientAction as clientAction };`);
  } else if (exported.has("clientAction")) {
    tail.push(`export { clientAction };`);
  }
  if (exported.has("middleware")) {
    const own = exported.has("clientMiddleware") ? ", clientMiddleware" : "";
    tail.push(`const __clientMiddleware = __sandbox.clientMiddleware(middleware${own});`, `export { __clientMiddleware as clientMiddleware };`);
  } else if (exported.has("clientMiddleware")) {
    tail.push(`export { clientMiddleware };`);
  }
  if (exported.has("clientLoader") && !exported.has("loader")) tail.push(`export { clientLoader };`);
  if (isRoot && !/export function HydrateFallback\b/.test(code)) {
    tail.push(`export { HydrateFallback } from "/sandbox/route.ts";`);
  }

  return `${out}\n\n${tail.join("\n")}\n`;
}
