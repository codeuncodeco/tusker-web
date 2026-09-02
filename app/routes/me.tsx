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

import { readToday, readToggles } from "../board";
import { TodayChip, Toggle } from "../board-chrome";
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
import { listUnified } from "../unified.server";
import type { Route } from "./+types/me";

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

  // The chip narrows the board to the tasks today's plan holds. A null plan is
  // a day the person has not planned, and an emptied one holds nothing to
  // narrow to, so neither draws a chip.
  const plan = await readPlan(env.DB, set.personId, day);
  const planned = plan ?? [];
  const hasPlan = planned.length > 0;
  const inPlan = new Set(planned);
  const today = readToday(query) && hasPlan;
  const drawn = today ? tasks.filter((task) => inPlan.has(task.id)) : tasks;

  return {
    orgs: set.orgs.map(held),
    day,
    columns: columnsFor(drawn, shown),
    planned,
    toggles,
    today,
    /** Today's plan holds a task, so the chip has something to narrow to. */
    hasPlan,
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
  const { orgs, columns, planned, toggles, today, hasPlan, day, ask } = loaderData;

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl tracking-tight">Your tasks</h1>
        <nav className="flex items-baseline gap-4">
          {/* A person with no plan for today gets no chip: there is nothing
              to narrow to, and the header carries Plan on every page. */}
          {hasPlan ? <TodayChip today={today} hasPlan /> : null}
          {UNIFIED_TOGGLES.map((which) => (
            <Toggle key={which} which={which} toggles={toggles} />
          ))}
        </nav>
      </header>

      {/* The order in a column is derived, so the plan is where a person says
          what to work first. The keys are on the controls now, so this line
          says what the page is for and nothing about a press. See ADR-0011. */}
      <p className="text-muted">
        Each column is in the order your boards give it. The plan is where you say what to
        work first.
      </p>

      <UnifiedBoard columns={columns} orgs={orgs} planned={new Set(planned)} day={day} />

      <DecisionPrompt ask={ask} />
    </main>
  );
}
