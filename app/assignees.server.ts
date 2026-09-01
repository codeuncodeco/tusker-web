/**
 * The reads and the writes behind the assignee.
 *
 * The set lives in `task_assignees`, keyed by task and account and carrying
 * the org, so the foreign key reaches `memberships (org_id, user_id)`. That is
 * what makes "an assignee is a member of the task's org" a rule the database
 * keeps rather than a check a screen remembers. Removing a member therefore
 * takes their assignments with them, and no read filters for it. See ADR-0013.
 *
 * Every function here takes a scope, so `org_id` fences these rows the way it
 * fences a task row.
 */

import { holderOf, type Holder } from "./assignees";
import type { Scope } from "./scope.server";

/** The account columns a holder is drawn from. */
type MemberRow = { id: string; name: string; email: string };

/** The same, with the task the row hangs on, for a whole board in one read. */
type HeldRow = MemberRow & { task_id: string };

/**
 * The members who hold one task, in the order a card draws them.
 *
 * The name orders the list, so a card's initials do not shuffle between two
 * draws of the same task.
 */
const HOLDER_COLUMNS = `u.id, u.name, u.email`;
const IN_NAME_ORDER = "ORDER BY u.name, u.email, u.id";

/** The members who hold one task of the org. */
export async function holdersOf(db: D1Database, scope: Scope, taskId: string): Promise<Holder[]> {
  const { results } = await db
    .prepare(
      `SELECT ${HOLDER_COLUMNS}
       FROM task_assignees a
       JOIN "user" u ON u.id = a.user_id
       WHERE a.task_id = ? AND a.org_id = ?
       ${IN_NAME_ORDER}`,
    )
    .bind(taskId, scope.org.id)
    .all<MemberRow>();
  return results.map(holderOf);
}

/**
 * The holders of every task of the org, keyed by task id.
 *
 * A board draws a column of cards, so it reads the whole org at once. A task
 * nobody holds is absent from the map, which is what unassigned means.
 */
export async function holdersByTask(
  db: D1Database,
  scope: Scope,
): Promise<Map<string, Holder[]>> {
  const { results } = await db
    .prepare(
      `SELECT a.task_id, ${HOLDER_COLUMNS}
       FROM task_assignees a
       JOIN "user" u ON u.id = a.user_id
       WHERE a.org_id = ?
       ${IN_NAME_ORDER}`,
    )
    .bind(scope.org.id)
    .all<HeldRow>();

  const held = new Map<string, Holder[]>();
  for (const row of results) {
    const holders = held.get(row.task_id) ?? [];
    holders.push(holderOf(row));
    held.set(row.task_id, holders);
  }
  return held;
}

/**
 * The assignees a form names, or the reason none of them is written.
 *
 * An id the org holds no membership for is refused rather than dropped. A form
 * that names another org's member is a form that got the org wrong, and a
 * silent save would tell the person the task is held when it is not.
 */
export async function readAssignees(
  db: D1Database,
  scope: Scope,
  form: FormData,
): Promise<{ ids: string[] } | { error: string }> {
  const asked = [...new Set(form.getAll("assignee").map(String).filter(Boolean))];
  if (asked.length === 0) return { ids: [] };

  const { results } = await db
    .prepare(
      `SELECT user_id FROM memberships
       WHERE org_id = ? AND user_id IN (${asked.map(() => "?").join(", ")})`,
    )
    .bind(scope.org.id, ...asked)
    .all<{ user_id: string }>();

  const members = new Set(results.map((row) => row.user_id));
  const outside = asked.filter((id) => !members.has(id));
  if (outside.length > 0) {
    return { error: `${scope.org.name} has no such member. Pick from the list.` };
  }

  return { ids: asked };
}

/**
 * Writes the set of members who hold one task: the ones named, and nobody
 * else.
 *
 * The old rows go and the new ones land in one batch, because a task that
 * loses its holders and does not gain the new ones is a task the board draws
 * as unassigned. The caller checked the ids with `readAssignees`, and the
 * foreign key checks them again.
 */
export async function setAssignees(
  db: D1Database,
  scope: Scope,
  taskId: string,
  ids: string[],
): Promise<void> {
  const orgId = scope.org.id;

  await db.batch([
    db
      .prepare("DELETE FROM task_assignees WHERE task_id = ? AND org_id = ?")
      .bind(taskId, orgId),
    ...ids.map((id) =>
      db
        .prepare("INSERT INTO task_assignees (task_id, org_id, user_id) VALUES (?, ?, ?)")
        .bind(taskId, orgId, id),
    ),
  ]);
}
