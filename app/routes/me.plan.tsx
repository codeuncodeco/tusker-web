/**
 * Plan mode: the tasks one person chose for one day, in the order they mean to
 * work them.
 *
 * The page is the unified view with selection turned on — one sort, one row
 * component, two routes. Two cross-org lists that sort differently is a bug
 * the day one of them changes.
 *
 * The candidate list is therefore that list: To do and In progress, every org.
 * Backlog is unplannable, and that is right: picking a task for today is the
 * act of taking it out of the backlog, so a person moves it to To do first.
 *
 * Every pick, drop and step writes the row. There is no draft the browser
 * holds, because a plan the tab can lose is no plan, and Tusker is server
 * authoritative. See ADR-0004.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";

import { cloudflareEnv } from "../context.server";
import { dayOf, isDay } from "../day";
import { OrgSwitcher } from "../org-switcher";
import { movePlan, readPlan } from "../plans.server";
import { requireOrgSet } from "../scope.server";
import { groupsFor } from "../unified";
import { actOnTask } from "../unified-actions.server";
import { listUnified } from "../unified.server";
import { useLocalDay, useUnifiedKeys } from "../unified-keys";
import { UnifiedRow } from "../unified-row";
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

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const set = await requireOrgSet(request, env);

  const day = dayFor(request, params.day);
  const plan = (await readPlan(env.DB, set.personId, day)) ?? [];
  const tasks = await listUnified(env.DB, set, plan);
  // The picked group holds the plan in plan order. A planned id no org answers
  // for is left out, so a task that was archived or deleted drops out of the
  // plan rather than raising an error.
  const groups = groupsFor(tasks, plan);

  return {
    orgs: set.orgs.map((org) => ({ slug: org.slug, name: org.name, kind: org.kind })),
    day,
    /** True for a day the path named, which the browser must not talk out of. */
    named: params.day !== undefined,
    groups,
    picked: groups[0].tasks.map((one) => one.id),
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

  const done = await actOnTask(env, set, day, form);
  if (!done) throw new Response("That form does not name an action.", { status: 400 });

  return { ok: true };
}

export default function Plan({ loaderData }: Route.ComponentProps) {
  const { orgs, groups, picked, day, named } = loaderData;
  const post = useFetcher();
  const [on, setOn] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // One flat order, so `j` and `k` walk the page the way a person reads it.
  const rows = groups.flatMap((group) => group.tasks);
  const pickedIds = new Set(picked);
  const cursor = rows.some((one) => one.id === on) ? on : (rows[0]?.id ?? null);

  useLocalDay(day, !named);
  useUnifiedKeys(rows, pickedIds, cursor, setOn, (fields) => post.submit(fields, { method: "post" }));

  useEffect(() => {
    list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Plan</h1>
        <span className="tabular-nums text-sm text-neutral-500">{day}</span>
        <OrgSwitcher orgs={orgs} />
      </header>

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Press <kbd>p</kbd> to pick a task, and the arrows to say in what order you will work
        them. Every pick is kept.
      </p>

      <div ref={list} className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
              {group.key === "today" ? "Picked" : group.label}{" "}
              <span className="text-neutral-400">{group.tasks.length}</span>
            </h2>

            {group.key === "today" && group.tasks.length === 0 ? (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Nothing picked yet.
              </p>
            ) : null}

            <ul className="flex flex-col gap-2">
              {group.tasks.map((task, at) => (
                <UnifiedRow
                  key={task.id}
                  task={task}
                  planned={pickedIds.has(task.id)}
                  selected={cursor === task.id}
                  domId={`row-${task.id}`}
                  // Only the picked list has an order of the person's own.
                  moves={
                    group.key === "today"
                      ? { up: at > 0, down: at < group.tasks.length - 1 }
                      : undefined
                  }
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Link to="/me" className="text-sm underline">
        Your tasks
      </Link>
    </main>
  );
}
