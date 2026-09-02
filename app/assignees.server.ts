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

import { assigneeOf, inNameOrder, type Assignee } from "./assignees";
import type { ReadScope, Scope } from "./scope.server";

/** The account columns an assignee is drawn from. */
type MemberRow = { id: string; name: string; email: string };

/** The same, with the task the row hangs on, for a whole board in one read. */
type HeldRow = MemberRow & { task_id: string };

/** The same, with the org the membership names, for several orgs in one read. */
type OrgMemberRow = MemberRow & { org_id: string };

/** The account columns every read here answers with. */
const ACCOUNT_COLUMNS = "u.id, u.name, u.email";

/**
 * The members who hold one task of the org.
 *
 * The name orders the list, in the code and not in the SQL, because the name a
 * screen reads is the email when the account carries none. Sorting the raw
 * column would put those two rules out of step with each other.
 */
export async function assigneesOf(
  db: D1Database,
  scope: Scope,
  taskId: string,
): Promise<Assignee[]> {
  const { results } = await db
    .prepare(
      `SELECT ${ACCOUNT_COLUMNS}
       FROM task_assignees a
       JOIN "user" u ON u.id = a.user_id
       WHERE a.task_id = ? AND a.org_id = ?`,
    )
    .bind(taskId, scope.org.id)
    .all<MemberRow>();
  return results.map(assigneeOf).sort(inNameOrder);
}

/**
 * The assignees of every task of the org, keyed by task id.
 *
 * A board draws a column of cards, so it reads the whole org at once. A task
 * nobody holds is absent from the map, which is what unassigned means.
 */
export async function assigneesByTask(
  db: D1Database,
  scope: Scope,
): Promise<Map<string, Assignee[]>> {
  const { results } = await db
    .prepare(
      `SELECT a.task_id, ${ACCOUNT_COLUMNS}
       FROM task_assignees a
       JOIN "user" u ON u.id = a.user_id
       WHERE a.org_id = ?`,
    )
    .bind(scope.org.id)
    .all<HeldRow>();

  const held = new Map<string, Assignee[]>();
  for (const row of results) {
    const assignees = held.get(row.task_id) ?? [];
    assignees.push(assigneeOf(row));
    held.set(row.task_id, assignees);
  }
  for (const assignees of held.values()) assignees.sort(inNameOrder);
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
 * loses its assignees and does not gain the new ones is a task the board draws
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

/**
 * Every member of one org, as a picker offers them.
 *
 * The task page and the quick-add box both draw this list, and a card draws
 * the same letters for the members who hold a task, so the read and the order
 * sit here rather than in each page.
 */
export async function membersOf(db: D1Database, scope: ReadScope): Promise<Assignee[]> {
  const rows = await memberRows(db, [scope.org.id]);
  return rows.map(assigneeOf).sort(inNameOrder);
}

/**
 * The same, for several orgs at once, keyed by org id.
 *
 * A cross-org page draws a box that files into whatever org its picker holds,
 * so it needs every list before the person picks. One read answers them all,
 * as one read answers the whole board's assignees.
 *
 * The caller names the orgs, and it holds the proof that the person belongs to
 * each of them: an `OrgSet` is that proof, and it is the only way these ids
 * are reached.
 */
export async function membersInOrgs(
  db: D1Database,
  orgIds: string[],
): Promise<Map<string, Assignee[]>> {
  const rows = await memberRows(db, orgIds);

  const members = new Map<string, Assignee[]>();
  for (const orgId of orgIds) members.set(orgId, []);
  for (const row of rows) members.get(row.org_id)?.push(assigneeOf(row));
  for (const list of members.values()) list.sort(inNameOrder);
  return members;
}

/** The accounts the named orgs hold, each row carrying the org it belongs to. */
async function memberRows(db: D1Database, orgIds: string[]): Promise<OrgMemberRow[]> {
  if (orgIds.length === 0) return [];

  const { results } = await db
    .prepare(
      `SELECT m.org_id, ${ACCOUNT_COLUMNS}
       FROM memberships m
       JOIN "user" u ON u.id = m.user_id
       WHERE m.org_id IN (${orgIds.map(() => "?").join(", ")})`,
    )
    .bind(...orgIds)
    .all<OrgMemberRow>();
  return results;
}
