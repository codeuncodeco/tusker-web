/**
 * What the global search answers: the tasks, the clients and the pages whose
 * name holds the words, across every org the person belongs to. The search
 * panel asks it as a person types. See ADR-0038.
 *
 * A task is matched by its title, or by its number, as `#12` or `12`. Every
 * read is fenced by the person's orgs, as every task read is.
 */

import { cloudflareEnv } from "../context.server";
import { clientsAcross } from "../clients.server";
import { notDeleted } from "../deleted.server";
import { readOrgSet } from "../scope.server";
import type { Status } from "../board";
import type { TaskId } from "../task-number";
import type { Route } from "./+types/search";

/** The most tasks one answer holds. A search is a way to one task, not a list. */
const TASKS = 8;

/** The most clients one answer holds. */
const CLIENTS = 5;

/** One answer of the search, as the panel draws it. */
export type Found = {
  tasks: { id: TaskId; title: string; status: Status; org: { slug: string; name: string; color: string | null } }[];
  clients: { slug: string; value: string; label: string; color: string | null; org: string }[];
};

/** Escapes the wildcards of a LIKE pattern, so `50%` means fifty percent. */
function literal(words: string): string {
  return words.replace(/[\\%_]/g, (mark) => `\\${mark}`);
}

export async function loader({ request, context }: Route.LoaderArgs): Promise<Found> {
  const env = context.get(cloudflareEnv);
  const set = await readOrgSet(request, env);
  const words = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!words || set.orgs.length === 0) return { tasks: [], clients: [] };

  const number = Number(words.replace(/^#/, ""));
  const holes = set.orgs.map(() => "?").join(", ");
  const { results } = await env.DB.prepare(
    `SELECT id, org_id, title, status FROM tasks
     WHERE org_id IN (${holes}) AND archived = 0 AND ${notDeleted()}
       AND (title LIKE ? ESCAPE '\\' OR id = ?)
     ORDER BY id = ? DESC, status IN ('todo', 'in_progress') DESC, updated_at DESC
     LIMIT ${TASKS}`,
  )
    .bind(...set.orgs.map((org) => org.id), `%${literal(words)}%`, Number.isInteger(number) ? number : -1, Number.isInteger(number) ? number : -1)
    .all<{ id: TaskId; org_id: string; title: string; status: Status }>();

  const orgs = new Map(set.orgs.map((org) => [org.id, { slug: org.slug, name: org.name, color: org.color }]));
  const lower = words.toLowerCase();
  const clients = (await clientsAcross(env.DB, set))
    .filter((one) => one.label.toLowerCase().includes(lower))
    .slice(0, CLIENTS)
    .map((one) => ({ slug: one.slug, value: one.value, label: one.label, color: one.color, org: one.org.name }));

  return {
    tasks: results.map((row) => ({ id: row.id, title: row.title, status: row.status, org: orgs.get(row.org_id)! })),
    clients,
  };
}
