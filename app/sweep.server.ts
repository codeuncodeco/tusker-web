/**
 * The cross-org sweep: one archive write per org, in sequence.
 *
 * A card of the unified board can belong to any org, and `org_id` is the only
 * fence between two orgs, so the write stays one org wide. This module groups
 * the cards the form named, mints one scope per org, and calls the same
 * archive write once per org. See ADR-0019.
 */

import { archiveTasks, restoreTasks } from "./archive.server";
import { scopeForSlug, type OrgSet, type Scope } from "./scope.server";
import { byOrg, type SweepResult, type Swept } from "./sweep";

/** The write one org takes: the sweep's, or its undo's. */
type Write = (db: D1Database, scope: Scope, taskIds: string[]) => Promise<string[]>;

/** Archives the cards a sweep named, one org at a time. */
export function sweepAcross(db: D1Database, set: OrgSet, cards: Swept[]): Promise<SweepResult> {
  return writeAcross(archiveTasks, db, set, cards);
}

/** Puts one whole batch back, org by org, as the sweep wrote it. */
export function restoreAcross(db: D1Database, set: OrgSet, cards: Swept[]): Promise<SweepResult> {
  return writeAcross(restoreTasks, db, set, cards);
}

/**
 * The write both acts make.
 *
 * Every scope is minted before anything is written, so a list naming an org
 * the person cannot reach writes nothing at all and answers 404, rather than
 * archiving the orgs before it.
 *
 * The orgs are then written in sequence. If one fails, the run stops and
 * reports exactly the cards it changed, and the undo names those: a half
 * sweep is undoable. Nothing rolls back the orgs that succeeded — a rollback
 * is a second write that can fail too, and the person has the undo.
 */
async function writeAcross(
  write: Write,
  db: D1Database,
  set: OrgSet,
  cards: Swept[],
): Promise<SweepResult> {
  const groups = byOrg(cards).map((group) => {
    const scope = scopeForSlug(set, group.slug);
    if (!scope) throw new Response("Not found", { status: 404 });
    return { scope, ids: group.ids };
  });

  const archived: Swept[] = [];
  for (const { scope, ids } of groups) {
    try {
      const changed = await write(db, scope, ids);
      archived.push(...changed.map((id) => ({ id, slug: scope.org.slug })));
    } catch {
      return { archived, partial: true };
    }
  }

  return { archived, partial: false };
}
