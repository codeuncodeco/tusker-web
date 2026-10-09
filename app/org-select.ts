/**
 * The org select: the header's one control for the board's scope, All or one
 * org. The address is the only current org, so nothing here remembers a pick.
 * See ADR-0029.
 */

import type { OrgHeld } from "./current-org";

/** The board of one scope: the unified board for All, the org board for one. */
export function boardOf(slug: string | null): string {
  return slug ? `/o/${slug}/board` : "/me";
}

/**
 * The org the header names: the org of the address, or, for a person in one
 * org, that org on every page. A person in one always stands in it, because All
 * and that org are the same tasks. On a person page of a person in several,
 * no org is named.
 */
export function namedOrg<T extends OrgHeld>(orgs: T[], slug: string | null): T | null {
  const named = slug ? orgs.find((org) => org.slug === slug) : undefined;
  return named ?? onlyOrg(orgs);
}

/** The one org of a person in one, or null for a person in none or several. */
export function onlyOrg<T>(orgs: T[]): T | null {
  return orgs.length === 1 ? orgs[0]! : null;
}

/**
 * Where a pick sent with no script lands. Anything that is not a slug reads as
 * All, so the reply can only name a page of this site. The org layout still
 * proves membership, so a slug the person does not hold is that layout's 404.
 */
export function pickedBoard(to: string | null): string {
  return boardOf(to && /^[a-z0-9-]+$/.test(to) ? to : null);
}
