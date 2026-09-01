/**
 * The current org: the org a person visited last, and the one the org half of
 * the header names while they stand on a person page. See ADR-0011.
 *
 * A cookie holds it and not `localStorage`, because the header is server
 * rendered. `localStorage` would draw the wrong org for one frame on every
 * load, and nothing at all without script.
 */

import { readCookie } from "./cookies";

/** The cookie every visit to an org page rewrites. */
export const ORG_COOKIE = "org";

/** What the header needs of one org. It never carries an id. */
export type OrgHeld = { slug: string; name: string; kind: "personal" | "team" };

/** The org the cookie names, or null before the person has visited one. */
export function slugOfCurrentOrg(request: Request): string | null {
  return readCookie(request, ORG_COOKIE);
}

/**
 * The `Set-Cookie` that remembers this visit. It is read on the server alone,
 * so no script may read it, and it outlives the session cookie by design: a
 * person who signs in again lands in the org they left.
 */
export function rememberOrg(slug: string): string {
  return `${ORG_COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=31536000; samesite=lax; httponly`;
}

/**
 * The current org, out of the orgs the person belongs to.
 *
 * A slug no membership answers for reads as none, so an org a person left, or
 * one they never held, falls back to the personal org rather than naming an
 * org the header cannot link to. A person who belongs to nothing has none.
 */
export function currentOrg<T extends OrgHeld>(orgs: T[], slug: string | null): T | null {
  const named = slug ? orgs.find((org) => org.slug === slug) : undefined;
  return named ?? orgs.find((org) => org.kind === "personal") ?? orgs[0] ?? null;
}
