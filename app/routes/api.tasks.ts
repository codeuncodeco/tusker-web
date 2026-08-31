import { cloudflareEnv } from "../context.server";
import { requireKeyScope } from "../scope.server";
import { filterTasks, readTaskFilter } from "../tasks.server";
import type { Route } from "./+types/api.tasks";

/**
 * The read API an org app calls for its own tasks. Tusker holds every task row
 * (ADR-0001), so this is how blrhikes-app draws a crew screen.
 *
 * The request carries an org key, which names the org and no person: crew are
 * not Tusker accounts and should not have to be. See ADR-0005.
 *
 * Reads only. An org app that wants a task written sends a person to Tusker.
 *
 * `GET /api/tasks?status=todo&status=in_progress&field.trail=skandagiri`
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireKeyScope(request, env);

  const filter = await readTaskFilter(env.DB, scope, new URL(request.url).searchParams);
  if ("error" in filter) return Response.json({ error: filter.error }, { status: 400 });

  const tasks = await filterTasks(env.DB, scope, filter);
  return Response.json({ org: { slug: scope.org.slug, name: scope.org.name }, tasks });
}
