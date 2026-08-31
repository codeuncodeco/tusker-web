import { redirect } from "react-router";

import { createAuth } from "./auth.server";

/** The signed-in person and their session, or null when nobody is signed in. */
export async function getSession(request: Request, env: Env) {
  const auth = createAuth(env, request);
  return auth.api.getSession({ headers: request.headers });
}

/**
 * The signed-in person, or a redirect to sign-in that remembers where the
 * request was going. Throws the redirect, so a loader can call it and stop.
 */
export async function requirePerson(request: Request, env: Env) {
  const found = await getSession(request, env);
  if (found) return found.user;

  const next = new URL(request.url).pathname;
  throw redirect(`/login?next=${encodeURIComponent(next)}`);
}

/** Copies the cookies an auth response set onto a response of our own. */
export function withCookies(from: Response, to: Response): Response {
  for (const cookie of from.headers.getSetCookie()) {
    to.headers.append("set-cookie", cookie);
  }
  return to;
}
