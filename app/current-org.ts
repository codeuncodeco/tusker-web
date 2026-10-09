/**
 * What the header holds of one org. The address is the only current org, so
 * no cookie remembers one and nothing here reads a request. See ADR-0029.
 */

import type { Org } from "./orgs.server";

/** What the header needs of one org. It never carries an id. */
export type OrgHeld = Pick<Org, "slug" | "name" | "color">;

/** One org, cut down to what the header draws. */
export function held(org: Org): OrgHeld {
  return { slug: org.slug, name: org.name, color: org.color };
}
