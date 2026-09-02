/**
 * The week page: the tasks one person means to finish in one named week.
 *
 * It is the unified view with selection turned on, the way plan mode is, and
 * it behaves like every other cross-org list: type a task straight into it,
 * undo that, finish one from it.
 *
 * The set carries no order. Membership is the whole statement, so the page
 * draws it in the sort every cross-org list has and gives no way to step a
 * row. The order of the work is the day's business. See ADR-0014.
 *
 * Every pick writes the row. There is no draft and no Commit button, because a
 * commitment the tab can lose is no commitment. See ADR-0008.
 */

import { cloudflareEnv } from "../context.server";
import { held } from "../current-org";
import { dayOf } from "../day";
import { DecisionPrompt } from "../decision-prompt";
import { askedAcross } from "../decisions.server";
import { requireOrgSet } from "../scope.server";
import { groupsFor } from "../unified";
import { UnifiedAdd } from "../unified-add";
import { actOnTask } from "../unified-actions.server";
import { listUnified } from "../unified.server";
import { UnifiedList } from "../unified-list";
import { isWeek, weekIn, weekSpan } from "../week";
import { readWeekSet, weekPicks } from "../weeks.server";
import type { Route } from "./+types/me.week";

/** What the pick button reads here: a week is picked, and a day is planned. */
const VERBS = { pick: "Pick", drop: "Unpick" };

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Week ${loaderData.week} — Tusker` }];
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
  const members = (await readWeekSet(env.DB, set.personId, week)) ?? [];
  // The members are read alongside the live set, so a task finished this week
  // keeps its membership and is drawn struck through. A member no org answers
  // for — archived, or in an org the person left — is left out of both.
  const tasks = await listUnified(env.DB, set, members);
  const groups = groupsFor(tasks, members, "week");
  const inWeek = groups.find((group) => group.key === "week")!;

  return {
    orgs: set.orgs.map(held),
    week,
    /** The Monday and the Friday the page draws between. */
    span: weekSpan(week),
    /** True for a week the path named, which the browser must not talk out of. */
    named: params.week !== undefined,
    /** The day the browser is in, which is what names an unnamed week. */
    day: dayOf(request),
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
  // An add here is a pick as well, so the task joins the week it is typed into.
  const picks = weekPicks(env.DB, set.personId, week, true);

  const acted = await actOnTask(env, request, set, picks, form);
  if (!acted) throw new Response("That form does not name an action.", { status: 400 });

  return acted;
}

export default function Week({ loaderData }: Route.ComponentProps) {
  const { orgs, groups, picked, week, span, day, done, ask } = loaderData;

  return (
    <main className="mx-auto flex flex-1 w-full max-w-3xl flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl tracking-tight">Your week</h1>
        <span className="tabular-nums text-muted">{week}</span>
        {/* Monday to Friday. Five days is a fact about the page: the set holds
            no day at all. */}
        <span className="text-muted">{span}</span>
        {picked.length > 0 ? (
          <span className="tabular-nums text-muted">
            {done} of {picked.length} done
          </span>
        ) : null}
      </header>

      {/* An add here is a pick: the task joins the week, like any other. */}
      <UnifiedAdd orgs={orgs} />

      <p className="text-muted">
        Press <kbd>p</kbd> to pick a task for this week, and <kbd>&gt;</kbd> and
        <kbd>&lt;</kbd> to walk one between columns. The week says what you mean to
        finish. The day says when. Every act is kept, so nothing waits on this tab.
      </p>

      <UnifiedList
        groups={groups}
        planned={new Set(picked)}
        day={day}
        // The page names a week and never a day, so the browser says which day
        // it is in, named week and all: that day is what names an unnamed week,
        // and the cookie is where the whole app reads it.
        // A week set has no order to keep, so no row steps here.
        verbs={VERBS}
      />

      <DecisionPrompt ask={ask} />
    </main>
  );
}
