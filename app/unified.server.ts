/**
 * The one read behind the unified view: every live task of every org the
 * person belongs to, each with its place in its own org column.
 *
 * The percentile is SQL work. `ROW_NUMBER()` and `COUNT()` over a window per
 * org column give it in one pass, and D1 is SQLite, so the functions are
 * there. No cap and no pagination: one person's live tasks are hundreds of
 * rows.
 */

import type { Status } from "./board";
import { listColors } from "./colors.server";
import { shownOnCard, type Shown } from "./fields";
import { listFields } from "./fields.server";
import { refLabels } from "./refs.server";
import { scopeIn, type OrgSet } from "./scope.server";
import type { LiveTask } from "./unified";

/**
 * The statuses the page draws. Backlog stays off it: a task in Backlog is one
 * the person decided not to work, and Done belongs to the decisions log.
 */
const LIVE_STATUSES = ["todo", "in_progress"] as const;

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
 * The tasks the page draws: To do and In progress from every org in the set,
 * plus whatever the day's plan holds, so a task finished today stays in Today
 * until the day rolls over.
 *
 * An archived task is out of both, which is how a planned task that was
 * archived drops off the plan rather than raising an error.
 */
export async function listUnified(
  db: D1Database,
  set: OrgSet,
  plan: string[],
): Promise<LiveTask[]> {
  if (set.orgs.length === 0) return [];

  const rows = await placedRows(db, set, plan);
  // The org's declarations decide what a card shows, so the page needs no code
  // for any one org's fields. Each read is scoped to its own org.
  const shown = await cardsByOrg(db, set);
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
    finished: row.status === "done" || row.status === "cancelled",
  }));
}

/**
 * Every task the page can draw, with its percentile.
 *
 * The window runs over every live task of the org set, and the filter comes
 * after it. A task the plan holds therefore keeps a percentile from its own
 * column, whichever column it is now in.
 */
async function placedRows(db: D1Database, set: OrgSet, plan: string[]): Promise<Row[]> {
  const orgs = holes(set.orgs.length);
  const statuses = holes(LIVE_STATUSES.length);
  // `id IN ()` is not SQL, so an empty plan names no ids at all.
  const planned = plan.length > 0 ? ` OR id IN (${holes(plan.length)})` : "";

  const { results } = await db
    .prepare(
      `WITH placed AS (
         SELECT id, org_id, title, status, due_date, data, created_at,
                CAST(ROW_NUMBER() OVER (
                       PARTITION BY org_id, status ORDER BY position, created_at, id
                     ) AS REAL)
                  / COUNT(*) OVER (PARTITION BY org_id, status) AS percentile
         FROM tasks
         WHERE archived = 0 AND org_id IN (${orgs})
       )
       SELECT * FROM placed WHERE status IN (${statuses})${planned}`,
    )
    .bind(...set.orgs.map((org) => org.id), ...LIVE_STATUSES, ...plan)
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

/** The `?, ?, ?` a bound list needs. */
function holes(count: number): string {
  return new Array(count).fill("?").join(", ");
}
