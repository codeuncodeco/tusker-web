/**
 * The org axis: the board, the decision log, one task, and the three admin
 * pages of one org.
 *
 * The layout loads the org, so the header has its name and its pages on every
 * one of them. The visit is what makes this org the current one, so the reply
 * carries the cookie that remembers it.
 */

import { Outlet, data } from "react-router";

import { cloudflareEnv } from "../context.server";
import { rememberOrg, slugOfCurrentOrg } from "../current-org";
import { Header } from "../header";
import { listOrgsForPerson } from "../orgs.server";
import { requireScope } from "../scope.server";
import type { Route } from "./+types/org";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug);

  const orgs = await listOrgsForPerson(env.DB, scope.personId);
  const org = { slug: scope.org.slug, name: scope.org.name, kind: scope.org.kind };

  // The cookie is rewritten only when it names another org, so the common
  // visit answers with no header of its own.
  const remembered = slugOfCurrentOrg(request) === org.slug;
  return data(
    { org, orgs: orgs.map((one) => ({ slug: one.slug, name: one.name, kind: one.kind })) },
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
