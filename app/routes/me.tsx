/**
 * The unified view: one person's tasks across every org they belong to, in
 * percentile order.
 *
 * The list is derived, not draggable. #34 dropped the personal rank, so this
 * page answers "what is next" and the plan answers "in what order I will do
 * it". See ADR-0006, "One order per column".
 */

import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";

import { cloudflareEnv } from "../context.server";
import { dayOf } from "../day";
import { OrgSwitcher } from "../org-switcher";
import { readPlan } from "../plans.server";
import { requireOrgSet } from "../scope.server";
import { groupsFor } from "../unified";
import { actOnTask } from "../unified-actions.server";
import { listUnified } from "../unified.server";
import { useLocalDay, useUnifiedKeys } from "../unified-keys";
import { UnifiedRow } from "../unified-row";
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
  const post = useFetcher();
  const [on, setOn] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // One flat order, so `j` and `k` walk the page the way a person reads it.
  const rows = groups.flatMap((group) => group.tasks);
  const plannedIds = new Set(planned);
  const empty = rows.length === 0;
  // The cursor starts at the top, and stays on its task while the list moves.
  const cursor = rows.some((one) => one.id === on) ? on : (rows[0]?.id ?? null);

  useLocalDay(day);
  useUnifiedKeys(rows, plannedIds, cursor, setOn, (fields) => post.submit(fields, { method: "post" }));

  // The cursor follows the keys down a list longer than the window.
  useEffect(() => {
    list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

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
        <div ref={list} className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
                {group.label} <span className="text-neutral-400">{group.tasks.length}</span>
              </h2>

              <ul className="flex flex-col gap-2">
                {group.tasks.map((task) => (
                  <UnifiedRow
                    key={task.id}
                    task={task}
                    planned={plannedIds.has(task.id)}
                    selected={cursor === task.id}
                    domId={`row-${task.id}`}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Link to="/account" className="text-sm underline">
        Your account
      </Link>
    </main>
  );
}
