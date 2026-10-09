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

import { redirect } from "react-router";

import { BOARD_TOGGLES, narrowingFor, readToggles } from "../board";
import { ColumnSwitch, TodayChip, WeekChip } from "../board-chrome";
import { cloudflareEnv } from "../context.server";
import { held } from "../current-org";
import { postAndReport } from "../pending";
import { dayOf } from "../day";
import { DecisionPrompt } from "../decision-prompt";
import { askedAcross } from "../decisions.server";
import { boardOf, onlyOrg } from "../org-select";
import { planPicks } from "../picks.server";
import { readPlan } from "../plans.server";
import { requireOrgSet } from "../scope.server";
import { readSwept } from "../sweep";
import { restoreAcross, sweepAcross } from "../sweep.server";
import { columnsFor, finishedSince, unifiedColumns } from "../unified";
import { UnifiedAdd } from "../unified-add";
import { UnifiedBoard } from "../unified-board";
import { actOnTask } from "../unified-actions.server";
import { listUnified, membersBySlug } from "../unified.server";
import { weekOf } from "../week";
import { readWeekSet } from "../weeks.server";
import type { Route } from "./+types/me";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Board — Tusker" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const set = await requireOrgSet(request, env);
  // All and one org are the same tasks, and the org board has the powers, so
  // a person in one org always stands there. The page's own loader sends them,
  // so a step from Week to here, which reruns no layout, sends them too. See
  // ADR-0029.
  const only = onlyOrg(set.orgs);
  if (only) throw redirect(boardOf(only.slug));

  const day = dayOf(request);
  const query = new URL(request.url).searchParams;
  const toggles = readToggles(query, BOARD_TOGGLES);
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
    /** The members of every org of two or more, for the picker on the box. */
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
  const intent = String(form.get("intent") ?? "");

  // The sweep of one finished column, and the one undo for that batch. A card
  // of this board can belong to any org, so each names its own, and the write
  // runs once per org. See ADR-0019.
  if (intent === "archive") return sweepAcross(env.DB, set, readSwept(form));
  // The undo runs the same way, so it can stop part way as well. It answers
  // with what it put back, and the toast that posted it says so.
  if (intent === "restore") return restoreAcross(env.DB, set, readSwept(form));

  const day = dayOf(request);
  // A pick on the board is a pick for today, as the chip reads it.
  const acted = await actOnTask(env, request, set, planPicks(env.DB, set.personId, day, false), form);
  if (!acted) throw new Response("That form does not name an action.", { status: 400 });

  return acted;
}

/** A post the server refuses raises a toast, not the error page. See `app/pending.ts`. */
export const clientAction = (args: Route.ClientActionArgs) => postAndReport(args);

export default function Me({ loaderData }: Route.ComponentProps) {
  const { orgs, members, columns, planned, toggles, today, hasPlan, week, hasSet, day, ask } =
    loaderData;

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      {/* The Top row: the box on the left and the filters on the right, on
          one line where the width allows. The header's org select is this
          page's heading. See ADR-0029.

          From `sm` up it sticks under the header, which is `h-16`, and the
          border under it sticks with it. It takes the page's pad as its own
          and spans the page's width, so a card scrolls under a solid row and
          not into a gap above it. See #191. */}
      <header
        data-top-row
        className="-mx-8 -mt-8 flex flex-wrap items-start gap-x-6 gap-y-3 border-b border-border bg-bg px-8 pb-6 pt-8 sm:sticky sm:top-16 sm:z-10"
      >
        {/* One box for the board, outside every keyed list, so no press of a
            typed word is ever the page's. The picker starts with no org every
            time. See ADR-0012 and ADR-0027. */}
        <div className="w-full sm:w-1/2 lg:w-1/3">
          <UnifiedAdd orgs={orgs} members={members} label="Add to To do" bare />
        </div>
        {/* No search box here to stand as tall as the title, so the switches
            drop to the title's text line. They take the rest of the row, and
            wrap under the box where they do not fit beside it. */}
        <nav className="flex flex-1 flex-wrap items-baseline justify-end gap-4 pt-1.5">
          {/* A person with no plan for today gets no chip: there is nothing
              to narrow to, and the header's ⋯ holds Plan on every page. The
              week set reads the same way, and ⋯ holds Week. */}
          {hasPlan ? <TodayChip today={today} hasPlan /> : null}
          {hasSet ? <WeekChip week={week} hasSet /> : null}
          {BOARD_TOGGLES.map((which) => (
            <ColumnSwitch key={which} which={which} toggles={toggles} />
          ))}
        </nav>
      </header>

      <UnifiedBoard
        columns={columns}
        orgs={orgs}
        planned={new Set(planned)}
        day={day}
      />

      <DecisionPrompt ask={ask} />
    </main>
  );
}
