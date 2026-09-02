/**
 * Plan mode: the tasks one person chose for one day, in the order they mean to
 * work them.
 *
 * The page draws the live set as a list, with selection turned on. It shares
 * the live set and the sort with the unified board and with focus mode, and
 * lays them out its own way: a plan drawn from a Done column is nonsense. Two
 * cross-org lists that sort differently is a bug the day one of them changes.
 *
 * The candidate list is therefore that list: To do and In progress, every org.
 * Backlog is unplannable, and that is right: picking a task for today is the
 * act of taking it out of the backlog, so a person moves it to To do first.
 *
 * The page draws the week set first and the rest of the live set below it:
 * plan mode is a shelf and not a fence. A pick from either half writes the
 * plan, and a pick the week set does not hold joins the set as well, so every
 * task a plan holds is in that week's set. See ADR-0014.
 *
 * A plan starts empty. The day carries nothing forward, because the week set
 * is what remembers unfinished work now.
 *
 * Every pick, drop and step writes the row. There is no draft the browser
 * holds and no Commit button, because a plan the tab can lose is no plan. See
 * ADR-0008, "A plan commits as it is made".
 */

import { cloudflareEnv } from "../context.server";
import { held } from "../current-org";
import { dayOf, isDay } from "../day";
import { DecisionPrompt } from "../decision-prompt";
import { askedAcross } from "../decisions.server";
import { planPicks } from "../picks.server";
import { movePlan, readPlan } from "../plans.server";
import { requireOrgSet } from "../scope.server";
import { planGroups } from "../unified";
import { UnifiedAdd } from "../unified-add";
import { actOnTask } from "../unified-actions.server";
import { listUnified } from "../unified.server";
import { UnifiedList } from "../unified-list";
import { weekOf } from "../week";
import { readWeekSet } from "../weeks.server";
import type { Route } from "./+types/me.plan";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Plan ${loaderData.day} — Tusker` }];
}

/**
 * The day the route speaks for: the one the path names, or the one the browser
 * is in. A path that names no calendar date is a 404, not yesterday.
 */
function dayFor(request: Request, named: string | undefined): string {
  if (named === undefined) return dayOf(request);
  if (!isDay(named)) throw new Response("Not found", { status: 404 });
  return named;
}

/**
 * True where the box may add to this day. A plan is never rewritten after its
 * day, so only the day the person is in takes an add. The loader draws the box
 * by this, and the action refuses by it. See ADR-0012.
 */
function canAddTo(request: Request, day: string): boolean {
  return day === dayOf(request);
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const set = await requireOrgSet(request, env);

  const day = dayFor(request, params.day);
  const plan = await readPlan(env.DB, set.personId, day);
  // The week the day sits in, whose set the page offers above everything else.
  const members = (await readWeekSet(env.DB, set.personId, weekOf(day))) ?? [];
  const tasks = await listUnified(env.DB, set, [...new Set([...(plan ?? []), ...members])]);
  // The first group holds the plan in plan order, and the second the week set
  // in percentile order. A picked id no org answers for is left out, so a task
  // that was archived or deleted drops out rather than raising an error.
  const groups = planGroups(tasks, plan ?? [], members);
  const inPlan = groups.find((group) => group.key === "today")!;

  return {
    orgs: set.orgs.map(held),
    day,
    /** True for a day the path named, which the browser must not talk out of. */
    named: params.day !== undefined,
    /** True where the box may add to this day, and so is drawn at all. */
    canAdd: canAddTo(request, day),
    groups,
    planned: inPlan.tasks.map((one) => one.id),
    // The prompt a finished row raised, if the query string still holds one.
    ask: await askedAcross(env.DB, set, request),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const set = await requireOrgSet(request, env);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const day = dayFor(request, params.day);

  // A step reads no task row. It moves an id the plan already holds, and an id
  // the plan does not hold moves nothing.
  if (intent === "up" || intent === "down") {
    await movePlan(env.DB, set.personId, day, String(form.get("id") ?? ""), intent);
    return { ok: true };
  }

  // An add here is a pick as well, so the task goes to the end of the day.
  // The page draws no box on a day it cannot add to, and the write says so too.
  if (intent === "create" && !canAddTo(request, day)) {
    throw new Response("A plan is never rewritten after its day.", { status: 400 });
  }

  // An add here is a pick as well, so the task goes to the end of the day.
  const picks = planPicks(env.DB, set.personId, day, true);
  const acted = await actOnTask(env, request, set, picks, form);
  if (!acted) throw new Response("That form does not name an action.", { status: 400 });

  return acted;
}

export default function Plan({ loaderData }: Route.ComponentProps) {
  const { orgs, groups, planned, day, named, canAdd, ask } = loaderData;

  return (
    <main className="mx-auto flex flex-1 w-full max-w-3xl flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl tracking-tight">Your plan</h1>
        <span className="tabular-nums text-muted">{day}</span>
      </header>

      {/* An add here is a pick: the task lands in the day, at the end, like
          any other. A named day carries no box. See ADR-0012. */}
      {canAdd ? <UnifiedAdd orgs={orgs} /> : null}

      <p className="text-muted">Every act is kept, so nothing waits on this tab.</p>

      <UnifiedList
        groups={groups}
        planned={new Set(planned)}
        day={day}
        namedDay={named}
        // The plan is the one order here that belongs to the person, so it is
        // the one group whose rows step. See ADR-0006, "One order per column".
        ordered="today"
        label={(group) => (group.key === "today" ? "Plan" : group.label)}
      />

      <DecisionPrompt ask={ask} />
    </main>
  );
}
