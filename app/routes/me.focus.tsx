/**
 * Focus mode: one batch of three tasks, and nothing else.
 *
 * Three is the whole feature. A plan of fourteen tasks is a list a person
 * reads; three is work they do. No other task is reachable from this screen,
 * and the next three appear only when this three are done.
 *
 * The batch draws from today's plan when a plan exists, in plan order. With no
 * plan it draws from the unified view, in that page's order, and the first act
 * writes those three as the day's plan, which is what holds the batch still.
 * See ADR-0009.
 */

import { Link } from "react-router";

import { cloudflareEnv } from "../context.server";
import { dayOf } from "../day";
import { FocusList, TakeMore } from "../focus-list";
import { holdBatch, readFocus, takeMore } from "../focus.server";
import { useLocalDay } from "../local-day";
import { OrgSwitcher } from "../org-switcher";
import { pushDownPlan } from "../plans.server";
import { requireOrgSet, scopeForSlug } from "../scope.server";
import { readTask } from "../tasks.server";
import { actOnTask } from "../unified-actions.server";
import type { Route } from "./+types/me.focus";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Focus — Tusker" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const set = await requireOrgSet(request, env);

  const day = dayOf(request);
  const focus = await readFocus(env.DB, set, set.personId, day);

  return {
    orgs: set.orgs.map((org) => ({ slug: org.slug, name: org.name, kind: org.kind })),
    day,
    tasks: focus.batch.tasks,
    number: focus.batch.number,
    left: focus.batch.left,
    planned: focus.planned,
    planEmpty: focus.planEmpty,
    more: focus.more,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const set = await requireOrgSet(request, env);

  const day = dayOf(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "more") {
    await takeMore(env.DB, set, set.personId, day);
    return { ok: true };
  }

  // The batch on the screen becomes today's plan before the act lands, so the
  // other two tasks stay where the person left them.
  if (intent === "finish" || intent === "drop") {
    await holdBatch(env.DB, set, set.personId, day);
  }

  if (intent === "drop") {
    // A drop reads the task row like every other act, so a task the person
    // cannot reach is a 404 and not an id a plan quietly moves.
    const scope = scopeForSlug(set, String(form.get("slug") ?? ""));
    const taskId = String(form.get("id") ?? "");
    const task = scope ? await readTask(env.DB, scope, taskId) : null;
    if (!scope || !task) throw new Response("Not found", { status: 404 });

    await pushDownPlan(env.DB, set.personId, day, taskId);
    return { ok: true };
  }

  const done = await actOnTask(env, set, day, form);
  if (!done) throw new Response("That form does not name an action.", { status: 400 });

  return { ok: true };
}

export default function Focus({ loaderData }: Route.ComponentProps) {
  const { orgs, tasks, number, left, planned, planEmpty, more, day } = loaderData;
  useLocalDay(day);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Focus</h1>
        {number > 0 ? (
          <span className="text-sm text-neutral-500">Batch {number}</span>
        ) : null}
        <OrgSwitcher orgs={orgs} />
      </header>

      {tasks.length > 0 ? (
        <>
          <FocusList tasks={tasks} droppable={true} />
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            <kbd>j</kbd> and <kbd>k</kbd> move, <kbd>Enter</kbd> opens, <kbd>x</kbd> finishes and{" "}
            <kbd>d</kbd> drops a task to the end of the plan.{" "}
            {left > 0 ? `${left} more, after these.` : "This is the last of them."}
          </p>
        </>
      ) : planEmpty ? (
        <p className="text-neutral-600 dark:text-neutral-400">
          Your plan for today is empty.{" "}
          <Link to="/me/plan" className="underline">
            Plan your day
          </Link>
          .
        </p>
      ) : planned ? (
        <p className="text-neutral-600 dark:text-neutral-400">That is the plan done.</p>
      ) : (
        <p className="text-neutral-600 dark:text-neutral-400">
          Nothing to do: no org you belong to holds a live task.
        </p>
      )}

      {tasks.length === 0 && more > 0 ? <TakeMore /> : null}

      <Link to="/me" className="text-sm underline">
        Your tasks
      </Link>
    </main>
  );
}
