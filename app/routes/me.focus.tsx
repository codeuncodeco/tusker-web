/**
 * Focus mode: one batch of three tasks, and nothing else.
 *
 * Three is the whole feature. A plan of fourteen tasks is a list a person
 * reads; three is work they do. No other task is reachable from this screen,
 * and the next three appear only when this three are done.
 *
 * The batch draws from today's plan when a plan exists, in plan order. With no
 * plan it draws from the live set, in the order `/me` sorts it, and the first act
 * writes those three as the day's plan, which is what holds the batch still.
 * See ADR-0009.
 */

import { cloudflareEnv } from "../context.server";
import { dayOf } from "../day";
import { DecisionPrompt } from "../decision-prompt";
import { askedAcross } from "../decisions.server";
import { FocusList, TakeMore } from "../focus-list";
import { holdBatch, readFocus, takeMore } from "../focus.server";
import { useLocalDay } from "../local-day";
import { planPicks, pushDownPlan } from "../plans.server";
import { requireOrgSet } from "../scope.server";
import { actOnTask, taskFrom } from "../unified-actions.server";
import type { Route } from "./+types/me.focus";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Focus — Tusker" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const set = await requireOrgSet(request, env);

  const day = dayOf(request);

  return {
    day,
    focus: await readFocus(env.DB, set, set.personId, day),
    // The prompt a finished task raised, if the query string still holds one.
    ask: await askedAcross(env.DB, set, request),
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
    await holdBatch(env.DB, set.personId, day, await readFocus(env.DB, set, set.personId, day));
  }

  if (intent === "drop") {
    // A drop reads the task row like every other act, so a task the person
    // cannot reach is a 404 and not an id a plan quietly moves.
    const { task } = await taskFrom(env, set, form);
    await pushDownPlan(env.DB, set.personId, day, task.id);
    return { ok: true };
  }

  // Finishing here is the act the board makes, so a marked task raises the
  // prompt from focus mode as it does from every other screen.
  const acted = await actOnTask(env, request, set, planPicks(env.DB, set.personId, day, false), form);
  if (!acted) throw new Response("That form does not name an action.", { status: 400 });

  return acted;
}

export default function Focus({ loaderData }: Route.ComponentProps) {
  const { focus, day, ask } = loaderData;
  const { batch, planned, planEmpty, more } = focus;
  useLocalDay(day);

  return (
    <main className="mx-auto flex flex-1 w-full max-w-2xl flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Focus</h1>
        {batch.number > 0 ? (
          <span className="text-sm text-neutral-500">Batch {batch.number}</span>
        ) : null}
      </header>

      {batch.tasks.length > 0 ? (
        <>
          <FocusList tasks={batch.tasks} />
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            <kbd>j</kbd> and <kbd>k</kbd> move, <kbd>Enter</kbd> opens, <kbd>x</kbd> finishes and{" "}
            <kbd>d</kbd> drops a task to the end of the plan.{" "}
            {batch.left > 0 ? `${batch.left} more, after these.` : "This is the last of them."}
          </p>
        </>
      ) : planEmpty ? (
        <p className="text-neutral-600 dark:text-neutral-400">
          Your plan for today is empty.
        </p>
      ) : planned ? (
        <p className="text-neutral-600 dark:text-neutral-400">That is the plan done.</p>
      ) : (
        <p className="text-neutral-600 dark:text-neutral-400">
          Nothing to do: no org you belong to holds a live task.
        </p>
      )}

      {batch.tasks.length === 0 && more > 0 ? <TakeMore /> : null}

      <DecisionPrompt ask={ask} />
    </main>
  );
}
