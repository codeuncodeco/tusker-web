import { Link } from "react-router";

import type { Org } from "./orgs.server";

/** What the switcher draws for one org. It never carries an id. */
export type SwitchTo = Pick<Org, "slug" | "name" | "kind">;

/**
 * The orgs one person belongs to, personal first, with the org on screen
 * marked. Every entry is a plain link, so the switcher works without script.
 */
export function OrgSwitcher({ orgs, here }: { orgs: SwitchTo[]; here?: string }) {
  return (
    <nav aria-label="Orgs" className="flex flex-wrap items-baseline gap-3 text-sm">
      {orgs.map((org) => (
        <span key={org.slug} className="flex items-baseline gap-1">
          {org.slug === here ? (
            <span aria-current="page" className="font-medium">
              {org.name}
            </span>
          ) : (
            <Link to={`/o/${org.slug}/board`} className="underline">
              {org.name}
            </Link>
          )}
          {org.kind === "personal" ? (
            <span className="text-xs uppercase tracking-wide text-neutral-500">personal</span>
          ) : null}
        </span>
      ))}
      <Link to="/orgs/new" className="underline">
        New org
      </Link>
      <Link to="/account" className="underline">
        Account
      </Link>
    </nav>
  );
}
