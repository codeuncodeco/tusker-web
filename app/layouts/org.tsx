/**
 * The org axis: the board, the decision log, one task, and the three admin
 * pages of one org.
 *
 * The layout proves the org once, in middleware, and every page under it reads
 * that scope rather than proving it again. The visit is what makes this org
 * the current one, so the reply carries the cookie that remembers it.
 */

import { Outlet, data } from "react-router";

import { cloudflareEnv } from "../context.server";
import { held, rememberOrg, slugOfCurrentOrg } from "../current-org";
import { Header } from "../header";
import { listOrgsForPerson } from "../orgs.server";
import { orgScope, requireScope } from "../scope.server";
import type { Route } from "./+types/org";

/**
 * Membership, proved before any loader of this branch runs. It throws for a
 * signed-out person and for an org they do not belong to, so no page under
 * here is reached without a scope.
 */
const holdScope: Route.MiddlewareFunction = async ({ request, context, params }) => {
  const env = context.get(cloudflareEnv);
  context.set(orgScope, await requireScope(request, env, params.slug));
};

export const middleware: Route.MiddlewareFunction[] = [holdScope];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);

  const orgs = await listOrgsForPerson(env.DB, scope.personId);
  const org = held(scope.org);

  // The cookie is rewritten only when it names another org, so the common
  // visit answers with no header of its own.
  const remembered = slugOfCurrentOrg(request) === org.slug;
  return data(
    { org, orgs: orgs.map(held) },
    remembered ? undefined : { headers: { "set-cookie": rememberOrg(org.slug) } },
  );
}

export default function Org({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-full flex-col">
      <Header orgs={loaderData.orgs} org={loaderData.org} />
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
