import { env } from "cloudflare:workers";
import { RouterContextProvider } from "react-router";

import { cloudflareEnv } from "../app/context.server";

export const SITE = "https://tusker.test";

/** Empties every table, so one test cannot see what another one wrote. */
export async function wipe() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM plans"),
    env.DB.prepare("DELETE FROM decisions"),
    env.DB.prepare("DELETE FROM task_assignees"),
    env.DB.prepare("DELETE FROM tasks"),
    env.DB.prepare("DELETE FROM org_ref_options"),
    env.DB.prepare("DELETE FROM org_field_colors"),
    env.DB.prepare("DELETE FROM org_fields"),
    env.DB.prepare("DELETE FROM org_keys"),
    env.DB.prepare("DELETE FROM memberships"),
    env.DB.prepare("DELETE FROM orgs"),
    env.DB.prepare("DELETE FROM session"),
    env.DB.prepare("DELETE FROM account"),
    env.DB.prepare("DELETE FROM verification"),
    env.DB.prepare('DELETE FROM "user"'),
  ]);
}

/** The arguments a loader or an action takes, with the Worker's env in place. */
export function routeArgs(request: Request, params: Record<string, string> = {}) {
  const context = new RouterContextProvider();
  context.set(cloudflareEnv, env);
  return { request, context, params } as never;
}

/** A form post to a route action. A list of values posts the field over again. */
export function post(path: string, fields: Record<string, string | string[]>) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const one of Array.isArray(value) ? value : [value]) body.append(name, one);
  }
  return new Request(`${SITE}${path}`, { method: "POST", body });
}

/** A GET, with cookies when the test carries a session. */
export function get(path: string, cookie?: string) {
  return new Request(`${SITE}${path}`, { headers: cookie ? { cookie } : {} });
}

/** The `Cookie` header that repeats what a response set. */
export function cookieFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((one) => one.split(";")[0])
    .join("; ");
}

/** A thrown redirect reads the same as a returned one. */
export async function caught(work: Promise<unknown>): Promise<Response> {
  try {
    const value = await work;
    if (value instanceof Response) return value;
    throw new Error("That call answered with data, not a response.");
  } catch (thrown) {
    if (thrown instanceof Response) return thrown;
    throw thrown;
  }
}
