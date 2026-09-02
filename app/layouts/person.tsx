/**
 * The person axis: the unified board, plan mode, focus mode, the account page
 * and the form that makes an org.
 *
 * The org half of the header needs a subject on a person page, and the current
 * org is it. `/orgs/new` sits here and not under an org, because no org exists
 * yet when a person opens it.
 */

import { Outlet } from "react-router";

import { cloudflareEnv } from "../context.server";
import { currentOrg, held, slugOfCurrentOrg } from "../current-org";
import { useFrame } from "../frame";
import { Header } from "../header";
import { requireOrgSet } from "../scope.server";
import type { Route } from "./+types/person";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const set = await requireOrgSet(request, env);

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
