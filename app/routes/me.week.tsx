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
 * The page walks between weeks, and the key is a link to the week's own
 * address: `/me/week/:week` is reachable by that walk and by nothing else. A
 * week that is over reads back and does not edit — a week set is never
 * rewritten after its week — so it takes no pick, no step and no add. What it
 * offers instead is the take: one line, one button, and the unfinished work
 * goes into the week the browser is in. See ADR-0014 and ADR-0021.
 *
 * Every pick writes the row. There is no draft and no Commit button, because a
 * commitment the tab can lose is no commitment. See ADR-0008.
 */

import { Form } from "react-router";

import { cloudflareEnv } from "../context.server";
import { held } from "../current-org";
import { dayOf } from "../day";
import { DecisionPrompt } from "../decision-prompt";
import { askedAcross } from "../decisions.server";
import { unfinishedOf, type Leftovers } from "../leftovers";
import { leftoversFor, unfinishedIn } from "../leftovers.server";
import { weekPicks } from "../picks.server";
import { requireOrgSet } from "../scope.server";
import { groupsFor, pickedOnly } from "../unified";
import { UnifiedAdd } from "../unified-add";
import { actOnTask, TASK_ACTS } from "../unified-actions.server";
import { listUnified, membersBySlug } from "../unified.server";
import { UnifiedList } from "../unified-list";
import { Walk } from "../walk";
import { isWeek, weekAfter, weekBefore, weekIn, weekSpan } from "../week";
import { addToWeek, moveInWeek, readWeekSet, startWeek } from "../weeks.server";
import type { Route } from "./+types/me.week";

/** What the pick button reads here: a week is picked, and a day is planned. */
const VERBS = { pick: "Pick", drop: "Unpick" };

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Week ${loaderData.week} — Tusker` }];
}

/**
 * True where the page may write this week's set: this week, or one still to
 * come.
 *
 * A week set is never rewritten after its week, as a plan is never rewritten
 * after its day. So a week that is over takes no pick, no unpick, no step, no
 * promote and no add, raises no leftovers prompt and takes no carry. Starting
 * it would also change what the next week reads as its last set. The loader
 * draws the acts by this, and the action refuses by it.
 */
function canPickIn(request: Request, week: string): boolean {
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
  const canPick = canPickIn(request, week);
  const started = await readWeekSet(env.DB, set.personId, week);
  // The week's own set is named for the week and not for the org members the
  // box picks from, which the page also reads.
  const weekSet = started ?? [];
  // A week already started raises no prompt, emptied set included: the parent
  // row says the person planned this week, and a set is theirs to empty.
  const leftovers = started === null && canPick ? await leftoversFor(env.DB, set, week) : null;
  // The set is read alongside the live tasks, so a task finished this week
  // keeps its membership and is drawn struck through. A member no org answers
  // for — archived, or in an org the person left — is left out of both.
  const tasks = await listUnified(env.DB, set, weekSet);
  // A week that is over draws its set alone. A list to pick from is noise
  // there, because nothing on this page picks. `/me/plan/:day` draws its plan
  // the same way. See #66.
  const groups = canPick ? groupsFor(tasks, weekSet, "week") : pickedOnly(tasks, weekSet, "week");
  const inWeek = groups.find((group) => group.key === "week")!;
  // What a week that is over leaves behind. A member no org answers for is not
  // in `tasks`, so it is not offered here and not taken either.
  const unfinished = canPick ? [] : unfinishedOf(weekSet, tasks);

  return {
    orgs: set.orgs.map(held),
    /** The members of every team org, for the picker on the box. */
    members: await membersBySlug(env.DB, set),
    week,
    /** The Monday and the Friday the page draws between. */
    span: weekSpan(week),
    /** True for a week the path named, which the browser must not talk out of. */
    named: params.week !== undefined,
    /** True where the page may pick, step and add: a week that is over does none. */
    canPick,
    /** True in the week the person is in. The walk offers no way home from there. */
    onThisWeek: week === weekIn(request),
    /** The two weeks the walk steps to. Every week of the calendar is one. */
    prev: weekBefore(week),
    next: weekAfter(week),
    /** The day the browser is in, which is what names an unnamed week. */
    day: dayOf(request),
    /** What the last set leaves over, or null when there is nothing to offer. */
    leftovers,
    /**
     * What this week leaves the week the browser is in, or null where it left
     * nothing: no unfinished member, or a week still being worked.
     */
    take: unfinished.length > 0 ? { into: weekIn(request), count: unfinished.length } : null,
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

  const intent = String(form.get("intent") ?? "");

  // The take: the unfinished work of a week that is over, fetched into the
  // week the browser is in. It writes that week alone, so this week keeps its
  // memberships and a taken task is in both sets, as a carried one is.
  //
  // It is the one write a week that is over answers, and it is refused on
  // every other week: a take into the week already on screen is nothing.
  if (intent === "take") {
    if (canPickIn(request, week)) {
      throw new Response("A take fetches from a week that is over.", { status: 400 });
    }
    const taken = await unfinishedIn(env.DB, set, week);
    // The top of the target set: this is unfinished work a person went and
    // fetched, which is the most deliberate act on the page. The block keeps
    // the order this week ranked it in. See ADR-0021.
    await addToWeek(env.DB, set.personId, weekIn(request), taken, "top");
    return { ok: true };
  }

  // The page draws no pick, no step and no box on a week it cannot write, and
  // the write says so too: a key, a stale tab and a hand-made post all land
  // here. A finish and a column move stand: the task is live wherever it is
  // drawn, and a record of the week is not a freeze of the work.
  if (!TASK_ACTS.includes(intent) && !canPickIn(request, week)) {
    throw new Response("A week set is never rewritten after its week.", { status: 400 });
  }

  // Carrying forward copies the old memberships into this week's set. The old
  // rows are read and never written, so a carried task is in both sets.
  if (intent === "carry" || intent === "clean") {
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
  const {
    orgs,
    members,
    groups,
    picked,
    week,
    span,
    day,
    done,
    leftovers,
    take,
    canPick,
    onThisWeek,
    prev,
    next,
    ask,
  } = loaderData;

  return (
    <main className="mx-auto flex flex-1 w-full max-w-3xl flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl tracking-tight">Your week</h1>
        <WeekWalk week={week} prev={prev} next={next} onThisWeek={onThisWeek} />
        {/* Monday to Friday. Five days is a fact about the page: the set holds
            no day at all. */}
        <span className="text-muted">{span}</span>
        {picked.length > 0 ? (
          <span className="tabular-nums text-muted">
            {done} of {picked.length} done
          </span>
        ) : null}
        {/* The one word that says why the page offers no pick and no step. */}
        {canPick ? null : <span className="text-muted">Read only</span>}
      </header>

      {/* An add here is a pick: the task joins the week, like any other. A week
          that is over carries no box, because a box that filed into another
          week would leave a person asking which week that landed in. */}
      {canPick ? <UnifiedAdd orgs={orgs} members={members} /> : null}

      {leftovers && <LeftoverPrompt leftovers={leftovers} />}

      {take && <TakePrompt week={week} take={take} />}

      <UnifiedList
        groups={groups}
        planned={new Set(picked)}
        day={day}
        // The page names a week and never a day, so the browser says which day
        // it is in, named week and all: that day is what names an unnamed week,
        // and the cookie is where the whole app reads it.
        //
        // The set is the one order on this page, so it is the group whose rows
        // move. A week past its own steps nothing: the order it was worked in
        // stands. See ADR-0021.
        ordered={canPick ? "week" : null}
        picks={canPick}
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
function LeftoverPrompt({ leftovers }: { leftovers: Leftovers }) {
  const count = leftovers.taskIds.length;

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
      <p className="grow">
        {weekSpan(leftovers.from)} left {count} {count === 1 ? "task" : "tasks"} unfinished.
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

/**
 * The take: what a week that is over left unfinished, and the one button that
 * fetches it.
 *
 * It takes into the week the browser is in and nowhere else, so the button
 * names that week. A person who wants another week walks to it and picks
 * there, which is what the walk is for.
 *
 * The write touches the target week alone. This week keeps its memberships, so
 * a taken task is in both sets, exactly as a carried one is.
 */
function TakePrompt({ week, take }: { week: string; take: { into: string; count: number } }) {
  const { into, count } = take;

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
      <p className="grow">
        {week} left {count} {count === 1 ? "task" : "tasks"} unfinished.
      </p>

      <Form method="post">
        <button name="intent" value="take" className="rounded border border-border px-3 py-1">
          Take {count === 1 ? "it" : "them"} into {into}
        </button>
      </Form>
    </section>
  );
}

/**
 * The walk between weeks: the week before, this week as its own address, the
 * week after, and the way back to this week. `app/walk.tsx` draws it, and plan
 * mode draws the same walk over days.
 *
 * A week that is over reads back, a week ahead is planned, and a week nobody
 * started draws empty and offers what it always offers. See #142.
 */
function WeekWalk({
  week,
  prev,
  next,
  onThisWeek,
}: {
  week: string;
  prev: string;
  next: string;
  onThisWeek: boolean;
}) {
  return (
    <Walk
      label="Week"
      here={week}
      prev={prev}
      next={next}
      href={(key) => `/me/week/${key}`}
      atHome={onThisWeek}
      home="/me/week"
      homeLabel="This week"
    />
  );
}
