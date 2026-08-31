import { isStatus, STATUSES, type Status } from "../board";
import { cloudflareEnv } from "../context.server";
import { listFields } from "../fields.server";
import { requireKeyScope, type ReadScope } from "../scope.server";
import { filterTasks, type TaskFilter } from "../tasks.server";
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

  const url = new URL(request.url);
  const filter = await readFilter(env.DB, scope, url.searchParams);
  if ("error" in filter) return Response.json({ error: filter.error }, { status: 400 });

  const tasks = await filterTasks(env.DB, scope, filter);
  return Response.json({ org: { slug: scope.org.slug, name: scope.org.name }, tasks });
}

/** The name a custom field filter carries, ahead of the key it narrows by. */
const FIELD_QUERY = "field.";

/**
 * What the query narrows to, or the reason it narrows to nothing a task could
 * match.
 *
 * A status Tusker does not draw and a field the org does not declare are both
 * 400s rather than empty answers, because each one is a caller typing a name
 * wrong, and an empty list reads as "no work" instead.
 */
async function readFilter(
  db: D1Database,
  scope: ReadScope,
  query: URLSearchParams,
): Promise<TaskFilter | { error: string }> {
  const statuses: Status[] = [];
  for (const value of query.getAll("status")) {
    if (!isStatus(value)) return { error: `No status is called ${value}. They are ${STATUSES.join(", ")}.` };
    statuses.push(value);
  }

  const asked = [...query.keys()].filter((name) => name.startsWith(FIELD_QUERY));
  if (asked.length === 0) return { statuses, fields: [] };

  const declared = new Set((await listFields(db, scope)).map((field) => field.key));
  const fields = [];
  for (const name of asked) {
    const key = name.slice(FIELD_QUERY.length);
    if (!declared.has(key)) return { error: `${scope.org.name} declares no field called ${key}.` };
    fields.push({ key, value: query.get(name) ?? "" });
  }

  return { statuses, fields };
}
