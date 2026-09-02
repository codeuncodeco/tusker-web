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
 * Every pick, drop and step writes the row. There is no draft the browser
 * holds and no Commit button, because a plan the tab can lose is no plan. See
 * ADR-0008, "A plan commits as it is made".
 */

import { Form } from "react-router";

import { cloudflareEnv } from "../context.server";
import { held } from "../current-org";
import { dayName, dayOf, isDay } from "../day";
import { DecisionPrompt } from "../decision-prompt";
import { askedAcross } from "../decisions.server";
import type { Leftovers } from "../leftovers";
import { leftoversFor } from "../leftovers.server";
import { movePlan, planPicks, readPlan, startPlan } from "../plans.server";
import { requireOrgSet } from "../scope.server";
import { groupsFor } from "../unified";
import { UnifiedAdd } from "../unified-add";
import { actOnTask } from "../unified-actions.server";
import { listUnified } from "../unified.server";
import { UnifiedList } from "../unified-list";
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
  // A day already planned raises no prompt, emptied plan included: the row
  // says the person started this day, and a plan is theirs to empty. Only the
  // day the person is in raises one at all, because leftovers carry into
  // today and not into a day the path names.
  const leftovers =
    plan === null && day === dayOf(request) ? await leftoversFor(env.DB, set, day) : null;
  const tasks = await listUnified(env.DB, set, plan ?? []);
  // The first group holds the plan in plan order. A planned id no org answers
  // for is left out, so a task that was archived or deleted drops out of the
  // plan rather than raising an error.
  const groups = groupsFor(tasks, plan ?? []);
  const inPlan = groups.find((group) => group.key === "today")!;

  return {
    orgs: set.orgs.map(held),
    day,
    /** True for a day the path named, which the browser must not talk out of. */
    named: params.day !== undefined,
    /** True where the box may add to this day, and so is drawn at all. */
    canAdd: canAddTo(request, day),
    /** What the last plan leaves over, or null when there is nothing to offer. */
    leftovers,
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

  // Carrying forward copies the leftovers into today's row. The old row is
  // read and never written, because a plan is what that day meant to be.
  if (intent === "carry" || intent === "clean") {
    if (day !== dayOf(request)) {
      throw new Response("Leftovers carry into today, not into a named day.", { status: 400 });
    }
    const carried = intent === "carry" ? await leftoversFor(env.DB, set, day) : null;
    await startPlan(env.DB, set.personId, day, carried?.taskIds ?? []);
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
  const { orgs, groups, planned, day, named, canAdd, leftovers, ask } = loaderData;

  return (
    <main className="mx-auto flex flex-1 w-full max-w-3xl flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Your plan</h1>
        <span className="tabular-nums text-sm text-neutral-500">{day}</span>
      </header>

      {/* An add here is a pick: the task lands in the day, at the end, like
          any other. A named day carries no box. See ADR-0012. */}
      {canAdd ? <UnifiedAdd orgs={orgs} /> : null}

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Press <kbd>p</kbd> to plan a task, and <kbd>J</kbd> and <kbd>K</kbd> to say in what
        order you will work them. Every act is kept, so nothing waits on this tab.
      </p>

      {leftovers && <LeftoverPrompt leftovers={leftovers} />}

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

/**
 * The two ways out of an unfinished day: carry the leftovers into this one, or
 * start clean. The prompt names the day it carries from, because the last plan
 * is often not yesterday.
 */
function LeftoverPrompt({ leftovers }: { leftovers: Leftovers }) {
  const count = leftovers.taskIds.length;

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
      <p className="grow">
        {dayName(leftovers.from)} left {count} {count === 1 ? "task" : "tasks"} unfinished.
      </p>

      <Form method="post" className="flex gap-2">
        <button
          name="intent"
          value="carry"
          className="rounded border border-neutral-300 px-3 py-1 dark:border-neutral-700"
        >
          Carry {count === 1 ? "it" : "them"} forward
        </button>
        <button
          name="intent"
          value="clean"
          className="rounded border border-neutral-300 px-3 py-1 dark:border-neutral-700"
        >
          Start clean
        </button>
      </Form>
    </section>
  );
}
