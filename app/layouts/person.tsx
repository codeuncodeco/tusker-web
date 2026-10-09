/**
 * The person axis: the unified board, plan mode, focus mode, the account page,
 * the org directory and the form that makes an org.
 *
 * A person page names no org, so the header's select reads All, except for a
 * person in one org, who always stands in it. See ADR-0029. `/orgs/new` sits
 * here and not under an org, because no org exists yet when a person opens it.
 */

import { Outlet, redirect } from "react-router";

import { cloudflareEnv } from "../context.server";
import { held } from "../current-org";
import { Header } from "../header";
import { namedOrg } from "../org-select";
import { DIRECTORY, readOrgSet } from "../scope.server";
import type { Route } from "./+types/person";

/**
 * The person pages a person who belongs to no org may open: the directory, the
 * account page, which signs out, and the form that makes an org. Every other
 * one sends them to the directory. See ADR-0027.
 */
const OPEN_WITHOUT_ORG = new Set([DIRECTORY, "/account", "/orgs/new"]);

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const set = await readOrgSet(request, env);
  const { pathname } = new URL(request.url);
  if (set.orgs.length === 0 && !OPEN_WITHOUT_ORG.has(pathname)) throw redirect(DIRECTORY);

  const orgs = set.orgs.map(held);
  return { orgs, org: namedOrg(orgs, null) };
}

export default function Person({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-full flex-col">
      <Header orgs={loaderData.orgs} org={loaderData.org} />
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
