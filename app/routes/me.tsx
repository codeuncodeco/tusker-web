/**
 * The unified view: one person's tasks across every org they belong to, in
 * percentile order.
 *
 * The list is derived, not draggable. #34 dropped the personal rank, so this
 * page answers "what is next" and the plan answers "in what order I will do
 * it". See ADR-0006.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useNavigate, useRevalidator } from "react-router";

import { cloudflareEnv } from "../context.server";
import { DAY_COOKIE, dayOf, localDay } from "../day";
import { OrgSwitcher } from "../org-switcher";
import { addToPlan, dropFromPlan, hasPlan, readPlan } from "../plans.server";
import { requireOrgSet, scopeIn } from "../scope.server";
import { moveTask, readTask } from "../tasks.server";
import { groupsFor, type Live } from "../unified";
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
  const plan = await readPlan(env.DB, set.personId, day);
  const tasks = await listUnified(env.DB, set, plan);
  const groups = groupsFor(tasks, plan);

  return {
    orgs: set.orgs.map((org) => ({ slug: org.slug, name: org.name, kind: org.kind })),
    day,
    groups,
    planned: plan,
    planStarted: await hasPlan(env.DB, set.personId, day),
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
  const org = set.orgs.find((one) => one.slug === String(form.get("slug") ?? ""));
  const scope = org ? scopeIn(set, org.id) : null;
  if (!scope || !(await readTask(env.DB, scope, taskId))) {
    throw new Response("Not found", { status: 404 });
  }

  if (intent === "plan") {
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
    await moveTask(env.DB, scope, { taskId, status: "done", before: null });
    return { ok: true };
  }

  throw new Response("That form does not name an action.", { status: 400 });
}

/**
 * Tells the server which day the person is living in. The Worker runs in UTC,
 * so until the browser says otherwise an evening east of UTC would read
 * yesterday's plan. The cookie is written once and the page asks again.
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
 * finishes. A key posts the same fields the row's own buttons carry.
 */
function useKeys(
  rows: Live[],
  planned: Set<string>,
  at: number,
  setAt: (at: number) => void,
  act: (fields: Record<string, string>) => void,
) {
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // A person typing in a box means the letter, not the key.
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const task = rows[at];
      if (event.key === "j") setAt(Math.min(at + 1, rows.length - 1));
      else if (event.key === "k") setAt(Math.max(at - 1, 0));
      else if (!task) return;
      else if (event.key === "Enter") navigate(`/o/${task.org.slug}/t/${task.id}`);
      else if (event.key === "p") act(planFields(task, planned.has(task.id)));
      else if (event.key === "x") act(finishFields(task));
      else return;

      event.preventDefault();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, planned, at, setAt, act, navigate]);
}

export default function Me({ loaderData }: Route.ComponentProps) {
  const { orgs, groups, planned, planStarted, day } = loaderData;
  const post = useFetcher();
  const [at, setAt] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  // One flat order, so `j` and `k` walk the page the way a person reads it.
  const rows = groups.flatMap((group) => group.tasks);
  const plannedIds = new Set(planned);
  const empty = rows.length === 0;

  useLocalDay(day);
  useKeys(rows, plannedIds, Math.min(at, Math.max(rows.length - 1, 0)), setAt, (fields) =>
    post.submit(fields, { method: "post" }),
  );

  // The selected row follows the keys down a list longer than the window.
  useEffect(() => {
    list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [at]);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Your tasks</h1>
        <OrgSwitcher orgs={orgs} />
      </header>

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

              {group.key === "today" && !planStarted ? (
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Plan your day: press <kbd>p</kbd> on a task to put it in today's plan.
                </p>
              ) : null}

              <ul className="flex flex-col gap-2">
                {group.tasks.map((task) => (
                  <UnifiedRow
                    key={task.id}
                    task={task}
                    planned={plannedIds.has(task.id)}
                    selected={rows[at]?.id === task.id}
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
