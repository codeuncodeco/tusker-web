/**
 * The one read behind the cross-org pages: the tasks of every org the person
 * belongs to, each with its place in its own org column.
 *
 * The percentile is SQL work. `ROW_NUMBER()` and `COUNT()` over a window per
 * org column give it in one pass, and D1 is SQLite, so the functions are
 * there. No cap and no pagination: one person's tasks are hundreds of rows.
 */

import { drawsAssignees, type Assignee } from "./assignees";
import { assigneesByTask } from "./assignees.server";
import type { Status } from "./board";
import { listColors } from "./colors.server";
import { shownOnCard, type Shown } from "./fields";
import { listFields } from "./fields.server";
import { refLabels } from "./refs.server";
import { scopeIn, type OrgSet } from "./scope.server";
import { FINISHED_STATUSES, type LiveTask } from "./unified";

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
   * The earliest `updated_at` a Done or Cancelled row may carry, or null for
   * no cap. It reaches no other status: a live task is drawn however old it is.
   */
  since?: string | null;
};

/** The live set: To do and In progress, the work a person still holds. */
export const LIVE: Wanted = { statuses: ["todo", "in_progress"] };

/** The row the query answers with, before a card's fields are read. */
type Row = {
  id: string;
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
  plan: string[],
  want: Wanted = LIVE,
): Promise<LiveTask[]> {
  if (set.orgs.length === 0) return [];

  const rows = await placedRows(db, set, plan, want);
  // The org's declarations decide what a card shows, so the page needs no code
  // for any one org's fields. Each read is scoped to its own org.
  const shown = await cardsByOrg(db, set);
  const held = await heldByTask(db, set);
  const named = new Map(set.orgs.map((org) => [org.id, { slug: org.slug, name: org.name }]));

  return rows.map((row) => ({
    id: row.id,
    org: named.get(row.org_id)!,
    title: row.title,
    status: row.status,
    due_date: row.due_date,
    percentile: row.percentile,
    created_at: row.created_at,
    fields: shown.get(row.org_id)!(JSON.parse(row.data) as Record<string, string>),
    assignees: held.get(row.id) ?? [],
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
  plan: string[],
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
    const capped = want.since ? " AND updated_at >= ?" : "";
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

  const { results } = await db
    .prepare(
      `WITH placed AS (
         SELECT id, org_id, title, status, due_date, data, created_at, updated_at,
                CAST(ROW_NUMBER() OVER (
                       PARTITION BY org_id, status ORDER BY position, created_at, id
                     ) AS REAL)
                  / COUNT(*) OVER (PARTITION BY org_id, status) AS percentile
         FROM tasks
         WHERE archived = 0 AND org_id IN (${holes(set.orgs.length)})
       )
       SELECT * FROM placed WHERE ${keep.join(" OR ")}`,
    )
    .bind(...values)
    .all<Row>();

  return results;
}

/** What one org's card shows of one task's stored values. */
type ShowFields = (data: Record<string, string>) => Shown[];

/**
 * How to read a card, per org.
 *
 * The labels of the reference fields come from the option cache, and the dots
 * from the org's option colours: one read per org and none per card. Sixty
 * rows must not become sixty calls to org apps, so an id the cache does not
 * hold shows raw.
 */
async function cardsByOrg(db: D1Database, set: OrgSet): Promise<Map<string, ShowFields>> {
  const read = await Promise.all(
    set.orgs.map(async (org) => {
      const scope = scopeIn(set, org.id)!;
      const [declared, labels, colors] = await Promise.all([
        listFields(db, scope),
        refLabels(db, scope),
        listColors(db, scope),
      ]);
      return [
        org.id,
        (data: Record<string, string>) => shownOnCard(declared, data, labels, colors),
      ] as const;
    }),
  );
  return new Map(read);
}

/**
 * Who holds each task, across the set. One read per team org and none per
 * card, as the org board does it.
 *
 * A personal org holds one member, so it draws no assignee and is not read at
 * all. A task id is a UUID, so one map covers every org. See ADR-0013.
 */
async function heldByTask(db: D1Database, set: OrgSet): Promise<Map<string, Assignee[]>> {
  const read = await Promise.all(
    set.orgs
      .filter(drawsAssignees)
      .map((org) => assigneesByTask(db, scopeIn(set, org.id)!)),
  );
  return new Map(read.flatMap((held) => [...held]));
}

/** The `?, ?, ?` a bound list needs. */
function holes(count: number): string {
  return new Array(count).fill("?").join(", ");
}
