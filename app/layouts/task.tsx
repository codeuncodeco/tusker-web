/**
 * One task, at `/t/<n>`.
 *
 * The path names the task and no org, so a link to a task does not break when
 * its org is renamed. The task still belongs to one org, and the page stands
 * in that org as the org pages do: the header names it. See ADR-0030.
 *
 * The layout finds the org from the task and proves the membership once, in
 * middleware, as the org layout does for a slug.
 */

import { Outlet } from "react-router";

import { cloudflareEnv } from "../context.server";
import { held } from "../current-org";
import { Header } from "../header";
import { listOrgsForPerson } from "../orgs.server";
import { requireTaskScope, taskScope } from "../scope.server";
import type { Route } from "./+types/task";

/**
 * The task and its org, proved before the page's loader runs. It throws the
 * same 404 for a task the person may not read and for one that is not there.
 */
const holdTask: Route.MiddlewareFunction = async ({ request, context, params }) => {
  const env = context.get(cloudflareEnv);
  context.set(taskScope, await requireTaskScope(request, env, params.n));
};

export const middleware: Route.MiddlewareFunction[] = [holdTask];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const { scope } = await requireTaskScope(request, env, params.n, context);

  const orgs = await listOrgsForPerson(env.DB, scope.personId);
  return { org: held(scope.org), orgs: orgs.map(held) };
}

export default function TaskLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-full flex-col">
      <Header orgs={loaderData.orgs} org={loaderData.org} />
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
