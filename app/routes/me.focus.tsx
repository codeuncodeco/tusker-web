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
import { planPicks } from "../picks.server";
import { requireOrgSet } from "../scope.server";
import { actOnTask } from "../unified-actions.server";
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
  if (intent === "finish") {
    await holdBatch(env.DB, set.personId, day, await readFocus(env.DB, set, set.personId, day));
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
        <h1 className="text-2xl tracking-tight">Focus</h1>
        {batch.number > 0 ? (
          <span className="text-muted">Batch {batch.number}</span>
        ) : null}
      </header>

      {batch.tasks.length > 0 ? (
        <>
          <FocusList tasks={batch.tasks} />
          {/* Finish draws a button, and the button carries `x`. These two keys
              move and open, and no control on the page says them. */}
          <p className="text-muted">
            <kbd>j</kbd> and <kbd>k</kbd> move, and <kbd>Enter</kbd> opens.{" "}
            {batch.left > 0 ? `${batch.left} more, after these.` : "This is the last of them."}
          </p>
        </>
      ) : planEmpty ? (
        <p className="text-muted">
          Your plan for today is empty.
        </p>
      ) : planned ? (
        <p className="text-muted">That is the plan done.</p>
      ) : (
        <p className="text-muted">
          Nothing to do: no org you belong to holds a live task.
        </p>
      )}

      {batch.tasks.length === 0 && more > 0 ? <TakeMore /> : null}

      <DecisionPrompt ask={ask} />
    </main>
  );
}
