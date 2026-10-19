/**
 * The one read behind the cross-org pages: the tasks of every org the person
 * belongs to, each with its place in its own org column.
 *
 * The percentile is SQL work. `ROW_NUMBER()` and `COUNT()` over a window per
 * org column give it in one pass, and D1 is SQLite, so the functions are
 * there. No cap and no pagination: one person's tasks are hundreds of rows.
 */

import { keeps } from "./assignee-filter";
import type { ClientPick } from "./client-filter";
import { drawsAssignees, type Assignee } from "./assignees";
import { assigneesByTask, membersInOrgs } from "./assignees.server";
import { FINISHED_STATUSES, type Status } from "./board";
import { listColors } from "./colors.server";
import { notDeleted } from "./deleted.server";
import { clientField, shownOnCard, type Shown } from "./fields";
import { listFields } from "./fields.server";
import { refLabels } from "./refs.server";
import { scopeIn, type OrgSet } from "./scope.server";
import type { LiveTask } from "./unified";
import type { TaskId } from "./task-number";

/**
 * Which rows a page wants of the org set.
 *
 * The unified board names the columns it draws. Plan mode, focus mode and the
 * leftover read want the live set and nothing else, so that is the default.
 */
export type Wanted = {
  /** The statuses to answer. */
  statuses: readonly Status[];
  /**
   * The earliest `finished_at` a Done or Cancelled row may carry, or null for
   * no cap. It reaches no other status: a live task is drawn however old it is.
   */
  since?: string | null;
  /**
   * The assignee value to keep, as `keeps` reads it, with `Mine` already the
   * person's id. Absent keeps every task. It reads the stored rows, so a task
   * an org of one holds answers for its member, though no card draws it.
   */
  assignee?: string;
  /**
   * The one client to keep, by its org and the value its tasks store. Absent
   * keeps every task. A task of an org with no client field never answers.
   * See ADR-0036.
   */
  client?: ClientPick | null;
};

/** The live set: To do and In progress, the work a person still holds. */
const LIVE: Wanted = { statuses: ["todo", "in_progress"] };

/** The row the query answers with, before a card's fields are read. */
type Row = {
  id: TaskId;
  org_id: string;
  title: string;
  status: Status;
  due_date: string | null;
  data: string;
  created_at: string;
  percentile: number;
};

/**
 * The tasks a page draws: the wanted statuses from every org in the set, plus
 * whatever the day's plan holds, so a task finished today stays in the plan
 * until the day rolls over.
 *
 * An archived task is out of both, which is how a planned task that was
 * archived drops off the plan rather than raising an error.
 */
export async function listUnified(
  db: D1Database,
  set: OrgSet,
  plan: TaskId[],
  want: Wanted = LIVE,
): Promise<LiveTask[]> {
  if (set.orgs.length === 0) return [];

  const rows = await placedRows(db, set, plan, want);
  // The org's declarations decide what a card shows, so the page needs no code
  // for any one org's fields. Each read is scoped to its own org.
  const shown = await cardsByOrg(db, set);
  const held = await heldByTask(db, set);
  const named = new Map(
    set.orgs.map((org) => [org.id, { slug: org.slug, name: org.name, color: org.color }]),
  );

  // An org of one stores its holder but draws none. See ADR-0032.
  const draws = new Set(set.orgs.filter(drawsAssignees).map((org) => org.id));
  const { assignee, client } = want;
  const slugOf = new Map(set.orgs.map((org) => [org.id, org.slug]));
  const kept = rows.filter(
    (row) =>
      (assignee === undefined || keeps(assignee, held.get(row.id) ?? [])) &&
      (!client || keepsClient(client, slugOf.get(row.org_id), shown.get(row.org_id)!.clientKey, row.data)),
  );

  return kept.map((row) => ({
    id: row.id,
    org: named.get(row.org_id)!,
    title: row.title,
    status: row.status,
    due_date: row.due_date,
    percentile: row.percentile,
    created_at: row.created_at,
    fields: shown.get(row.org_id)!.show(JSON.parse(row.data) as Record<string, string>),
    assignees: draws.has(row.org_id) ? (held.get(row.id) ?? []) : [],
    finished: row.status === "done" || row.status === "cancelled",
  }));
}

/**
 * Every task the page can draw, with its percentile.
 *
 * The window runs over every unarchived task of the org set, and the filter
 * comes after it. A task therefore keeps the percentile of its own column
 * whatever the page asked for, and the seven-day cap narrows Done without
 * changing where in Done a card sits.
 */
async function placedRows(
  db: D1Database,
  set: OrgSet,
  plan: TaskId[],
  want: Wanted,
): Promise<Row[]> {
  const wants = (finished: boolean) =>
    want.statuses.filter((status) => FINISHED_STATUSES.includes(status) === finished);

  const live = wants(false);
  const over = wants(true);
  const keep: string[] = [];
  const values: unknown[] = [...set.orgs.map((org) => org.id)];

  if (live.length > 0) {
    keep.push(`status IN (${holes(live.length)})`);
    values.push(...live);
  }

  if (over.length > 0) {
    const capped = want.since ? " AND finished_at >= ?" : "";
    keep.push(`(status IN (${holes(over.length)})${capped})`);
    values.push(...over);
    if (want.since) values.push(want.since);
  }

  // `id IN ()` is not SQL, so an empty plan names no ids at all.
  if (plan.length > 0) {
    keep.push(`id IN (${holes(plan.length)})`);
    values.push(...plan);
  }

  // A page that asks for no column and holds no plan asks for nothing.
  if (keep.length === 0) return [];

  // `finished_at` is in the CTE because the filter below reads it. No card
  // draws it.
  const { results } = await db
    .prepare(
      `WITH placed AS (
         SELECT id, org_id, title, status, due_date, data, created_at, finished_at,
                CAST(ROW_NUMBER() OVER (
                       PARTITION BY org_id, status ORDER BY position, created_at, id
                     ) AS REAL)
                  / COUNT(*) OVER (PARTITION BY org_id, status) AS percentile
         FROM tasks
         WHERE archived = 0 AND ${notDeleted()} AND org_id IN (${holes(set.orgs.length)})
       )
       SELECT * FROM placed WHERE ${keep.join(" OR ")}`,
    )
    .bind(...values)
    .all<Row>();

  return results;
}

/** What one org's card shows of one task's stored values. */
type ShowFields = (data: Record<string, string>) => Shown[];

/** How to read one org's cards, and the key its client field holds, if any. */
type OrgCards = { show: ShowFields; clientKey: string | null };

/**
 * True while a row belongs to the client the board narrows to: its org is the
 * client's, and it stores the client's value under that org's client field.
 */
function keepsClient(client: ClientPick, slug: string | undefined, key: string | null, data: string): boolean {
  if (slug !== client.slug || key === null) return false;
  return (JSON.parse(data) as Record<string, string>)[key] === client.value;
}

/**
 * How to read a card, per org.
 *
 * The labels of the reference fields come from the option cache, and the dots
 * from the org's option colours: one read per org and none per card. Sixty
 * rows must not become sixty calls to org apps, so an id the cache does not
 * hold shows raw.
 */
async function cardsByOrg(db: D1Database, set: OrgSet): Promise<Map<string, OrgCards>> {
  const read = await Promise.all(
    set.orgs.map(async (org) => {
      const scope = scopeIn(set, org.id)!;
      const [declared, labels, colors] = await Promise.all([
        listFields(db, scope),
        refLabels(db, scope),
        listColors(db, scope),
      ]);
      const show: ShowFields = (data) => shownOnCard(declared, data, labels, colors);
      return [org.id, { show, clientKey: clientField(declared)?.key ?? null }] as const;
    }),
  );
  return new Map(read);
}

/**
 * Who holds each task, across the set. One read per org and none per card, as
 * the org board does it.
 *
 * An org of one is read as well: it draws no assignee, but it stores its
 * member as the holder of every task, and `Mine` must find those. A task id is
 * a number counted across the instance, so one map covers every org. See
 * ADR-0030 and ADR-0032.
 */
async function heldByTask(db: D1Database, set: OrgSet): Promise<Map<TaskId, Assignee[]>> {
  const read = await Promise.all(
    set.orgs.map((org) => assigneesByTask(db, scopeIn(set, org.id)!)),
  );
  return new Map(read.flatMap((held) => [...held]));
}

/** The `?, ?, ?` a bound list needs. */
function holes(count: number): string {
  return new Array(count).fill("?").join(", ");
}

/**
 * The members of every org of two or more in the set, keyed by slug.
 *
 * A cross-org quick-add box draws the picker of whatever org the org picker
 * holds, so the lists come back with the page and no fetcher runs between a
 * pick and the picker it draws. One read answers every org, as one read
 * answers the whole board's assignees.
 *
 * The key is the slug, because a form names an org by its slug and no screen
 * carries an org id. An org of one member draws no picker, so it is not read
 * and not keyed. See ADR-0013.
 */
export async function membersBySlug(
  db: D1Database,
  set: OrgSet,
): Promise<Record<string, Assignee[]>> {
  const teams = set.orgs.filter(drawsAssignees);
  const members = await membersInOrgs(db, teams.map((org) => org.id));
  return Object.fromEntries(teams.map((org) => [org.slug, members.get(org.id) ?? []]));
}
