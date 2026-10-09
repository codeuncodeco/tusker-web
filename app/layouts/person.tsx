/**
 * The person axis: the unified board, plan mode, focus mode, the account page,
 * the org directory and the form that makes an org.
 *
 * The org half of the header needs a subject on a person page, and the current
 * org is it. `/orgs/new` sits here and not under an org, because no org exists
 * yet when a person opens it.
 */

import { Outlet, redirect } from "react-router";

import { cloudflareEnv } from "../context.server";
import { currentOrg, held, slugOfCurrentOrg } from "../current-org";
import { useFrame } from "../frame";
import { Header } from "../header";
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
  return { orgs, org: currentOrg(orgs, slugOfCurrentOrg(request)) };
}

export default function Person({ loaderData }: Route.ComponentProps) {
  // A board page holds still and scrolls inside its columns, so the wrapper is
  // the window and nothing taller. Every other page keeps document scroll.
  const frame = useFrame();

  return (
    <div
      className={`flex min-h-full flex-col ${frame ? "sm:h-full sm:min-h-0" : ""}`}
    >
      <Header orgs={loaderData.orgs} org={loaderData.org} />
      {/* The clip sits under the header, and not around it, because the org
          menu and Manage are drawn over the page from inside the header. */}
      <div className={`flex flex-1 flex-col ${frame ? "sm:min-h-0 sm:overflow-hidden" : ""}`}>
        <Outlet />
      </div>
    </div>
  );
}
