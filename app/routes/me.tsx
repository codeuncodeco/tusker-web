/**
 * The unified board: one person's tasks across every org they belong to, in
 * the five columns the org board draws.
 *
 * The order inside a column is derived, so no card is dragged into a place.
 * #34 dropped the personal rank, so this page answers "what is next" and the
 * plan answers "in what order I will do it". See ADR-0006, "One order per
 * column".
 *
 * A card does move between columns, because a column is a status: a drag names
 * the column and never a place in it. The board posts the `move` intent the
 * card's select always posted, so this route needs nothing new for it. See
 * ADR-0015.
 */

import { narrowingFor, readToggles } from "../board";
import { ColumnSwitch, TodayChip, WeekChip } from "../board-chrome";
import { cloudflareEnv } from "../context.server";
import { held } from "../current-org";
import { dayOf } from "../day";
import { DecisionPrompt } from "../decision-prompt";
import { askedAcross } from "../decisions.server";
import { planPicks } from "../picks.server";
import { readPlan } from "../plans.server";
import { requireOrgSet } from "../scope.server";
import { columnsFor, finishedSince, unifiedColumns, UNIFIED_TOGGLES } from "../unified";
import { UnifiedBoard } from "../unified-board";
import { actOnTask } from "../unified-actions.server";
import { listUnified, membersBySlug } from "../unified.server";
import { weekOf } from "../week";
import { readWeekSet } from "../weeks.server";
import type { Route } from "./+types/me";

/** The board holds still and scrolls inside its columns. See `app/frame.ts`. */
export const handle = { frame: true };

export function meta(_: Route.MetaArgs) {
  return [{ title: "Your tasks — Tusker" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const set = await requireOrgSet(request, env);

  const day = dayOf(request);
  const query = new URL(request.url).searchParams;
  const toggles = readToggles(query, UNIFIED_TOGGLES);
  const shown = unifiedColumns(toggles);

  // Done and Cancelled cap to the last seven days. Across every org they would
  // otherwise be every task the person ever finished.
  const tasks = await listUnified(env.DB, set, [], {
    statuses: shown,
    since: finishedSince(day),
  });

  // The two chips narrow the board to the tasks today's plan holds, or to the
  // tasks this week's set holds. A null plan is a day the person has not
  // planned, and an emptied one holds nothing to narrow to, so neither draws a
  // chip. The week set reads the same way.
  const [plan, members] = await Promise.all([
    readPlan(env.DB, set.personId, day),
    readWeekSet(env.DB, set.personId, weekOf(day)),
  ]);
  const planned = plan ?? [];
  const inPlan = new Set(planned);
  const inWeek = new Set(members ?? []);
  // A board is narrowed by Today, by Week, or by neither. See ADR-0014.
  const { today, week, ids } = narrowingFor(query, inPlan, inWeek);
  const drawn = ids ? tasks.filter((task) => ids.has(task.id)) : tasks;

  return {
    orgs: set.orgs.map(held),
    /** The members of every team org, for the picker on the box. */
    members: await membersBySlug(env.DB, set),
    day,
    columns: columnsFor(drawn, shown),
    planned,
    toggles,
    today,
    week,
    /** Today's plan holds a task, so the chip has something to narrow to. */
    hasPlan: inPlan.size > 0,
    /** This week's set holds a task, so its chip has something to narrow to. */
    hasSet: inWeek.size > 0,
    // The prompt a finished card raised, if the query string still holds one.
    ask: await askedAcross(env.DB, set, request),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const set = await requireOrgSet(request, env);

  const form = await request.formData();
  const day = dayOf(request);
  // A pick on the board is a pick for today, as the chip reads it.
  const acted = await actOnTask(env, request, set, planPicks(env.DB, set.personId, day, false), form);
  if (!acted) throw new Response("That form does not name an action.", { status: 400 });

  return acted;
}

export default function Me({ loaderData }: Route.ComponentProps) {
  const { orgs, members, columns, planned, toggles, today, hasPlan, week, hasSet, day, ask } =
    loaderData;

  return (
    <main className="flex flex-1 flex-col gap-6 p-8 sm:min-h-0">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl tracking-tight">Your tasks</h1>
        <nav className="flex items-baseline gap-4">
          {/* A person with no plan for today gets no chip: there is nothing
              to narrow to, and the header carries Plan on every page. The
              week set reads the same way, and the header carries Week. */}
          {hasPlan ? <TodayChip today={today} hasPlan /> : null}
          {hasSet ? <WeekChip week={week} hasSet /> : null}
          {UNIFIED_TOGGLES.map((which) => (
            <ColumnSwitch key={which} which={which} toggles={toggles} />
          ))}
        </nav>
      </header>

      <UnifiedBoard
        columns={columns}
        orgs={orgs}
        members={members}
        planned={new Set(planned)}
        day={day}
      />

      <DecisionPrompt ask={ask} />
    </main>
  );
}
