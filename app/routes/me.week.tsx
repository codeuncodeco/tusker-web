/**
 * The week page: the tasks one person means to finish in one named week.
 *
 * It is the unified view with selection turned on, the way plan mode is, and
 * it behaves like every other cross-org list: type a task straight into it,
 * undo that, finish one from it.
 *
 * The set carries an order, and this page is where it is made: `J` and `K`
 * step a member, `T` promotes one to the top, and every page that draws the
 * set draws it in that order. No other order is on this page, so a step here
 * is unambiguous. See ADR-0021, which amends ADR-0014.
 *
 * A pick claims a place at the top. A member finished this week sinks under
 * the live ones as the page draws, and nothing is written for it: unfinishing
 * a task gives it its rank back.
 *
 * A week with no set opens on the leftovers prompt: the unfinished members of
 * the last week that holds one, to carry forward or to leave. That offer is
 * made once a week, and the day carries nothing. See ADR-0014.
 *
 * Every pick writes the row. There is no draft and no Commit button, because a
 * commitment the tab can lose is no commitment. See ADR-0008.
 */

import { Form, Link } from "react-router";

import { cloudflareEnv } from "../context.server";
import { held } from "../current-org";
import { dayOf } from "../day";
import { DecisionPrompt } from "../decision-prompt";
import { askedAcross } from "../decisions.server";
import type { Leftovers } from "../leftovers";
import { leftoversFor } from "../leftovers.server";
import { weekPicks } from "../picks.server";
import { requireOrgSet } from "../scope.server";
import { groupsFor } from "../unified";
import { UnifiedAdd } from "../unified-add";
import { actOnTask } from "../unified-actions.server";
import { listUnified, membersBySlug } from "../unified.server";
import { UnifiedList } from "../unified-list";
import { isWeek, weekIn, weekLabel, weekSpan } from "../week";
import { moveInWeek, readWeekSet, startWeek } from "../weeks.server";
import type { Route } from "./+types/me.week";

/** What the pick button reads here: a week is picked, and a day is planned. */
const VERBS = { pick: "Pick", drop: "Unpick" };

/**
 * The tab title names the week, span first: a row of tabs is read by its first
 * words, and `2026-W36` is a key a person has to work out.
 */
export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${weekSpan(loaderData.week, loaderData.day)} — Tusker` }];
}

/**
 * True for a week the offer may reach: this one, or one still to come.
 *
 * A week set is never rewritten after its week, as a plan is never rewritten
 * after its day. Starting a week that is over would also change what the next
 * week reads as its last set, so a past week raises no prompt and takes no
 * carry. The loader draws the prompt by this, and the action refuses by it.
 */
function canStart(request: Request, week: string): boolean {
  return week >= weekIn(request);
}

/**
 * The week the route speaks for: the one the path names, or the one the
 * browser is in. A key no calendar holds is a 404, not this week.
 */
function weekFor(request: Request, named: string | undefined): string {
  if (named === undefined) return weekIn(request);
  if (!isWeek(named)) throw new Response("Not found", { status: 404 });
  return named;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const set = await requireOrgSet(request, env);

  const week = weekFor(request, params.week);
  const started = await readWeekSet(env.DB, set.personId, week);
  // The week's own set is named for the week and not for the org members the
  // box picks from, which the page also reads.
  const weekSet = started ?? [];
  // A week already started raises no prompt, emptied set included: the parent
  // row says the person planned this week, and a set is theirs to empty.
  const leftovers =
    started === null && canStart(request, week) ? await leftoversFor(env.DB, set, week) : null;
  // The set is read alongside the live tasks, so a task finished this week
  // keeps its membership and is drawn struck through. A member no org answers
  // for — archived, or in an org the person left — is left out of both.
  const tasks = await listUnified(env.DB, set, weekSet);
  const groups = groupsFor(tasks, weekSet, "week");
  const inWeek = groups.find((group) => group.key === "week")!;

  return {
    orgs: set.orgs.map(held),
    /** The members of every team org, for the picker on the box. */
    members: await membersBySlug(env.DB, set),
    week,
    /** True for a week the path named, which the browser must not talk out of. */
    named: params.week !== undefined,
    /**
     * The day the browser is in. It names an unnamed week, and it says what
     * "This week" means and which year the reader is in.
     */
    day: dayOf(request),
    /** What the last set leaves over, or null when there is nothing to offer. */
    leftovers,
    groups,
    picked: inWeek.tasks.map((one) => one.id),
    /** What the week says on a Friday: six of nine. */
    done: inWeek.tasks.filter((one) => one.finished).length,
    // The prompt a finished row raised, if the query string still holds one.
    ask: await askedAcross(env.DB, set, request),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const set = await requireOrgSet(request, env);

  const form = await request.formData();
  const week = weekFor(request, params.week);

  // Carrying forward copies the old memberships into this week's set. The old
  // rows are read and never written, so a carried task is in both sets.
  const intent = String(form.get("intent") ?? "");
  if (intent === "carry" || intent === "clean") {
    if (!canStart(request, week)) {
      throw new Response("A week set is never rewritten after its week.", { status: 400 });
    }
    const carried = intent === "carry" ? await leftoversFor(env.DB, set, week) : null;
    await startWeek(env.DB, set.personId, week, carried?.taskIds ?? []);
    return { ok: true };
  }

  // A move reads no task row. It moves an id the set already holds, and an id
  // the set does not hold moves nothing.
  if (intent === "up" || intent === "down" || intent === "top") {
    await moveInWeek(env.DB, set.personId, week, String(form.get("id") ?? ""), intent);
    return { ok: true };
  }

  // An add here is a pick as well, so the task joins the week it is typed into.
  // A task that leaves the set leaves this week's plans from today forward.
  const picks = weekPicks(env.DB, set.personId, week, true, dayOf(request));

  const acted = await actOnTask(env, request, set, picks, form);
  if (!acted) throw new Response("That form does not name an action.", { status: 400 });

  return acted;
}

export default function Week({ loaderData }: Route.ComponentProps) {
  const { orgs, members, groups, picked, week, day, done, leftovers, ask } = loaderData;

  return (
    <main className="mx-auto flex flex-1 w-full max-w-3xl flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        {/* The heading is the week itself. "Your week" said only what the nav
            label says already, and `2026-W36` is the address and not a
            reading. Monday to Friday: five days is a fact about the page, and
            the set holds no day at all.

            It links to its own dated address, because that address is the
            thing a person keeps. */}
        <h1 className="text-2xl tracking-tight">
          <Link to={`/me/week/${week}`} className="underline-offset-4 hover:underline">
            {weekLabel(week, day)}
          </Link>
        </h1>
        {picked.length > 0 ? (
          <span className="tabular-nums text-muted">
            {done} of {picked.length} done
          </span>
        ) : null}
      </header>

      {/* An add here is a pick: the task joins the week, like any other. */}
      <UnifiedAdd orgs={orgs} members={members} />

      {leftovers && <LeftoverPrompt leftovers={leftovers} today={day} />}

      <UnifiedList
        groups={groups}
        planned={new Set(picked)}
        day={day}
        // The page names a week and never a day, so the browser says which day
        // it is in, named week and all: that day is what names an unnamed week,
        // and the cookie is where the whole app reads it.
        //
        // The set is the one order on this page, so it is the group whose rows
        // move. See ADR-0021.
        ordered="week"
        verbs={VERBS}
      />

      <DecisionPrompt ask={ask} />
    </main>
  );
}

/**
 * The two ways out of an unfinished week: carry its leftovers into this one,
 * or start clean. The prompt names the week it carries from, because the last
 * week that holds a set is not always the week before.
 */
function LeftoverPrompt({ leftovers, today }: { leftovers: Leftovers; today: string }) {
  const count = leftovers.taskIds.length;

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
      <p className="grow">
        {weekSpan(leftovers.from, today)} left {count} {count === 1 ? "task" : "tasks"} unfinished.
      </p>

      <Form method="post" className="flex gap-2">
        <button name="intent" value="carry" className="rounded border border-border px-3 py-1">
          Carry {count === 1 ? "it" : "them"} forward
        </button>
        <button name="intent" value="clean" className="rounded border border-border px-3 py-1">
          Start clean
        </button>
      </Form>
    </section>
  );
}
