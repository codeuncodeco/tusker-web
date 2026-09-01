/**
 * The unified view: one person's tasks across every org they belong to, in
 * percentile order.
 *
 * The list is derived, not draggable. #34 dropped the personal rank, so this
 * page answers "what is next" and the plan answers "in what order I will do
 * it". See ADR-0006, "One order per column".
 */

import { cloudflareEnv } from "../context.server";
import { held } from "../current-org";
import { dayOf } from "../day";
import { DecisionPrompt } from "../decision-prompt";
import { askedAcross } from "../decisions.server";
import { readPlan } from "../plans.server";
import { requireOrgSet } from "../scope.server";
import { groupsFor } from "../unified";
import { UnifiedAdd } from "../unified-add";
import { actOnTask } from "../unified-actions.server";
import { listUnified } from "../unified.server";
import { UnifiedList } from "../unified-list";
import type { Route } from "./+types/me";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Your tasks — Tusker" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const set = await requireOrgSet(request, env);

  const day = dayOf(request);
  // A null plan is a day the person has not planned. An emptied plan is not
  // one, so the offer to plan the day goes away once they start.
  const plan = await readPlan(env.DB, set.personId, day);
  const tasks = await listUnified(env.DB, set, plan ?? []);
  const groups = groupsFor(tasks, plan ?? []);

  return {
    orgs: set.orgs.map(held),
    day,
    groups,
    planned: plan ?? [],
    // The prompt a finished row raised, if the query string still holds one.
    ask: await askedAcross(env.DB, set, request),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const set = await requireOrgSet(request, env);

  const form = await request.formData();
  const acted = await actOnTask(env, request, set, dayOf(request), form);
  if (!acted) throw new Response("That form does not name an action.", { status: 400 });

  return acted;
}

export default function Me({ loaderData }: Route.ComponentProps) {
  const { orgs, groups, planned, day, ask } = loaderData;
  const empty = groups.every((group) => group.tasks.length === 0);

  return (
    <main className="mx-auto flex flex-1 w-full max-w-3xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Your tasks</h1>

      {/* The box files into the org the picker names, and plans nothing: on
          this page an add is an add. See ADR-0012. */}
      <UnifiedAdd orgs={orgs} />

      {/* The header carries Plan on every page, so this line teaches the
          keystroke and links nothing. See ADR-0011. */}
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Press <kbd>p</kbd> on a task to put it in today's plan.
      </p>

      {empty ? (
        <p className="text-neutral-600 dark:text-neutral-400">
          Nothing to do: no org you belong to holds a live task.
        </p>
      ) : (
        <UnifiedList groups={groups} planned={new Set(planned)} day={day} />
      )}

      <DecisionPrompt ask={ask} />
    </main>
  );
}
