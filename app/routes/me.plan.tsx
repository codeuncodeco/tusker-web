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
 *
 * The shelf is drawn in week order and never rewritten here: the one order
 * this page owns is the plan's. See ADR-0021.
 *
 * The page walks between days, and the date is a link to the day's own address:
 * `/me/plan/:day` is reachable by that walk and by nothing else. A day before
 * today reads back and does not edit — building a plan and reading one back are
 * not the same act — so it draws its plan alone. See #66.
 */

import { cloudflareEnv } from "../context.server";
import { held } from "../current-org";
import { dayAfter, dayBefore, dayOf, isDay } from "../day";
import { DecisionPrompt } from "../decision-prompt";
import { askedAcross } from "../decisions.server";
import { planPicks } from "../picks.server";
import { movePlan, readPlan } from "../plans.server";
import { requireOrgSet } from "../scope.server";
import { pickedOnly, planGroups } from "../unified";
import { UnifiedAdd } from "../unified-add";
import { actOnTask, TASK_ACTS } from "../unified-actions.server";
import { listUnified, membersBySlug } from "../unified.server";
import { UnifiedList } from "../unified-list";
import { Walk } from "../walk";
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
 * True where the page may write this day's plan. A plan is never rewritten
 * after its day, so a past day reads back: it takes no pick and no step. Today
 * and the days ahead of it are planned as they always were. The loader draws
 * the acts by this, and the action refuses by it.
 */
function canPlanOn(request: Request, day: string): boolean {
  return day >= dayOf(request);
}

/**
 * True where the box may add to this day. An add is a pick and a new task
 * both, and a task is made on the day it is thought of, so only the day the
 * person is in takes one. See ADR-0012.
 */
function canAddTo(request: Request, day: string): boolean {
  return day === dayOf(request);
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const set = await requireOrgSet(request, env);

  const day = dayFor(request, params.day);
  const canPlan = canPlanOn(request, day);
  const plan = await readPlan(env.DB, set.personId, day);
  // The week the day sits in, whose set the page offers above everything else,
  // in the order the week page gave it. A day read back is offered nothing,
  // because it picks nothing.
  const members = canPlan ? ((await readWeekSet(env.DB, set.personId, weekOf(day))) ?? []) : [];
  const tasks = await listUnified(env.DB, set, [...new Set([...(plan ?? []), ...members])]);
  // The first group holds the plan in plan order, and the second the week set
  // in week order. A picked id no org answers for is left out, so a task that
  // was archived or deleted drops out rather than raising an error.
  // A day read back draws the plan alone: a shelf nothing can be picked from
  // is noise.
  const groups = canPlan ? planGroups(tasks, plan ?? [], members) : pickedOnly(tasks, plan ?? []);
  const inPlan = groups.find((group) => group.key === "today")!;

  return {
    orgs: set.orgs.map(held),
    /** The members of every team org, for the picker on the box. */
    members: await membersBySlug(env.DB, set),
    day,
    /** True for a day the path named, which the browser must not talk out of. */
    named: params.day !== undefined,
    /** True on the day the person is in. The walk offers no way home from there. */
    onToday: day === dayOf(request),
    /** True where the box may add to this day, and so is drawn at all. */
    canAdd: canAddTo(request, day),
    /** True where the page may pick and step: a past day does neither. */
    canPlan,
    /** The two days the walk steps to. Every day of the calendar is one. */
    prev: dayBefore(day),
    next: dayAfter(day),
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

  // The page draws no pick and no step on a day it cannot plan, and the write
  // says so too: a key, a stale tab and a hand-made post all land here.
  if (!TASK_ACTS.includes(intent) && !canPlanOn(request, day)) {
    throw new Response("A plan is never rewritten after its day.", { status: 400 });
  }

  // An add is a pick and a new task both. The box is drawn on one day, so it
  // is refused on every other one, behind today and ahead of it alike.
  if (intent === "create" && !canAddTo(request, day)) {
    throw new Response("A task is made on the day it is thought of.", { status: 400 });
  }

  // A move reads no task row. It moves an id the plan already holds, and an id
  // the plan does not hold moves nothing.
  if (intent === "up" || intent === "down" || intent === "top") {
    await movePlan(env.DB, set.personId, day, String(form.get("id") ?? ""), intent);
    return { ok: true };
  }

  // An add here is a pick as well, so the task goes to the end of the day.
  const picks = planPicks(env.DB, set.personId, day, true);
  const acted = await actOnTask(env, request, set, picks, form);
  if (!acted) throw new Response("That form does not name an action.", { status: 400 });

  return acted;
}

export default function Plan({ loaderData }: Route.ComponentProps) {
  const { orgs, members, groups, planned, day, named, onToday, canAdd, canPlan, prev, next, ask } =
    loaderData;

  return (
    <main className="mx-auto flex flex-1 w-full max-w-3xl flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl tracking-tight">Your plan</h1>
        <DayWalk day={day} prev={prev} next={next} onToday={onToday} />
        {/* The one word that says why the page offers no pick and no step. */}
        {canPlan ? null : <span className="text-muted">Read only</span>}
      </header>

      {/* An add here is a pick: the task lands in the day, at the end, like
          any other. A named day carries no box. See ADR-0012. */}
      {canAdd ? <UnifiedAdd orgs={orgs} members={members} /> : null}

      <UnifiedList
        groups={groups}
        planned={new Set(planned)}
        day={day}
        namedDay={named}
        // The plan is the one order here that belongs to the person, so it is
        // the one group whose rows step. See ADR-0006, "One order per column".
        // A day past its own steps nothing: the order it was worked in stands.
        ordered={canPlan ? "today" : null}
        picks={canPlan}
        label={(group) => (group.key === "today" ? "Plan" : group.label)}
      />

      <DecisionPrompt ask={ask} />
    </main>
  );
}

/**
 * The walk between days: the day before, this day as its own address, the day
 * after, and the way back to today. `app/walk.tsx` draws it, and the week page
 * draws the same walk over weeks. See #66.
 */
function DayWalk({
  day,
  prev,
  next,
  onToday,
}: {
  day: string;
  prev: string;
  next: string;
  onToday: boolean;
}) {
  return (
    <Walk
      label="Day"
      here={day}
      prev={prev}
      next={next}
      href={(key) => `/me/plan/${key}`}
      atHome={onToday}
      home="/me/plan"
      homeLabel="Today"
    />
  );
}
