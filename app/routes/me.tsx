/**
 * The unified view: one person's tasks across every org they belong to, in
 * percentile order.
 *
 * The list is derived, not draggable. #34 dropped the personal rank, so this
 * page answers "what is next" and the plan answers "in what order I will do
 * it". See ADR-0006, "One order per column".
 */

import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useNavigate, useRevalidator } from "react-router";

import { cloudflareEnv } from "../context.server";
import { DAY_COOKIE, dayOf, localDay } from "../day";
import { OrgSwitcher } from "../org-switcher";
import { addToPlan, dropFromPlan, readPlan } from "../plans.server";
import { requireOrgSet, scopeForSlug } from "../scope.server";
import { moveTask, readTask } from "../tasks.server";
import { groupsFor, type LiveTask } from "../unified";
import { listUnified } from "../unified.server";
import { UnifiedRow, finishFields, planFields } from "../unified-row";
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
  const intent = String(form.get("intent") ?? "");
  const taskId = String(form.get("id") ?? "");
  const day = dayOf(request);

  // Every act names the org the task belongs to, and the row is read back
  // through the one-org scope. A task the person cannot reach is a 404 here,
  // not a row a plan quietly picks up.
  const scope = scopeForSlug(set, String(form.get("slug") ?? ""));
  const task = scope ? await readTask(env.DB, scope, taskId) : null;
  if (!scope || !task) throw new Response("Not found", { status: 404 });

  if (intent === "plan") {
    // Picking a task for today is the act of taking it out of the backlog, so
    // a person moves it to To do first. The write says so, not only the page.
    if (task.status !== "todo" && task.status !== "in_progress") {
      throw new Response("Only a To do or In progress task can be planned.", { status: 400 });
    }
    await addToPlan(env.DB, set.personId, day, taskId);
    return { ok: true };
  }

  if (intent === "unplan") {
    await dropFromPlan(env.DB, set.personId, day, taskId);
    return { ok: true };
  }

  if (intent === "finish") {
    // Finishing here is the move the board makes, so one act has one meaning.
    // The decision prompt lands with #39, which raises it wherever a task is
    // finished.
    if (task.status !== "done") {
      await moveTask(env.DB, scope, { taskId, status: "done", before: null });
    }
    return { ok: true };
  }

  throw new Response("That form does not name an action.", { status: 400 });
}

/**
 * Tells the server which day the person is in. The Worker runs in UTC, so an
 * evening east of UTC reads the wrong plan until the browser says the day.
 * The cookie is written once, and the page then asks again.
 */
function useLocalDay(day: string) {
  const revalidator = useRevalidator();

  useEffect(() => {
    const here = localDay();
    if (here === day) return;
    document.cookie = `${DAY_COOKIE}=${here}; path=/; max-age=86400; samesite=lax`;
    revalidator.revalidate();
  }, [day, revalidator]);
}

/**
 * The keys the page binds: `j` and `k` move, `Enter` opens, `p` plans and `x`
 * finishes. A key posts the fields the row's own buttons carry, so a key and a
 * click send one thing.
 *
 * The cursor names a task, not a place in the list. A plan moves a row into
 * Today, and the cursor goes with it.
 */
function useKeys(
  rows: LiveTask[],
  planned: Set<string>,
  on: string | null,
  setOn: (id: string) => void,
  act: (fields: Record<string, string>) => void,
) {
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // A person who types in a box wants the letter, not the key.
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const at = rows.findIndex((one) => one.id === on);
      const task = rows[at];
      if (event.key === "j") setOn(rows[Math.min(at + 1, rows.length - 1)]?.id ?? "");
      else if (event.key === "k") setOn(rows[Math.max(at - 1, 0)]?.id ?? "");
      else if (!task) return;
      else if (event.key === "Enter") navigate(`/o/${task.org.slug}/t/${task.id}`);
      else if (event.key === "p") act(planFields(task, planned.has(task.id)));
      // A task already finished has nothing left to finish.
      else if (event.key === "x") {
        if (task.finished) return;
        act(finishFields(task));
      } else return;

      event.preventDefault();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, planned, on, setOn, act, navigate]);
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
  useKeys(rows, plannedIds, cursor, setOn, (fields) => post.submit(fields, { method: "post" }));

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
          Plan your day: press <kbd>p</kbd> on a task to put it in today's plan.
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
