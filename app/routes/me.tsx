/**
 * The unified view: one person's tasks across every org they belong to, in
 * percentile order.
 *
 * The list is derived, not draggable. #34 dropped the personal rank, so this
 * page answers "what is next" and the plan answers "in what order I will do
 * it". See ADR-0006, "One order per column".
 */

import { Link } from "react-router";

import { cloudflareEnv } from "../context.server";
import { dayOf } from "../day";
import { OrgSwitcher } from "../org-switcher";
import { readPlan } from "../plans.server";
import { requireOrgSet } from "../scope.server";
import { groupsFor } from "../unified";
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
    orgs: set.orgs.map((org) => ({ slug: org.slug, name: org.name, kind: org.kind })),
    day,
    groups,
    planned: plan ?? [],
    planStarted: plan !== null,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const set = await requireOrgSet(request, env);

  const form = await request.formData();
  const done = await actOnTask(env, set, dayOf(request), form);
  if (!done) throw new Response("That form does not name an action.", { status: 400 });

  return { ok: true };
}

export default function Me({ loaderData }: Route.ComponentProps) {
  const { orgs, groups, planned, planStarted, day } = loaderData;
  const empty = groups.every((group) => group.tasks.length === 0);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Your tasks</h1>
        <OrgSwitcher orgs={orgs} />
      </header>

      {planStarted ? null : (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          <Link to="/me/plan" className="underline">
            Plan your day
          </Link>
          , or press <kbd>p</kbd> on a task to put it in today's plan.
        </p>
      )}

      {empty ? (
        <p className="text-neutral-600 dark:text-neutral-400">
          Nothing to do: no org you belong to holds a live task.
        </p>
      ) : (
        <UnifiedList groups={groups} planned={new Set(planned)} day={day} />
      )}

      <div className="flex gap-4 text-sm">
        <Link to="/me/focus" className="underline">
          Focus on three
        </Link>
        <Link to="/account" className="underline">
          Your account
        </Link>
      </div>
    </main>
  );
}
