import { useEffect, useRef } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";

import { STATUS_LABEL, columnsToShow, isStatus, type Status, type Toggles } from "../board";
import { cloudflareEnv } from "../context.server";
import { fieldClass } from "../forms";
import { orgForMember } from "../orgs.server";
import { requirePerson } from "../session.server";
import { createTask, listTasks, setTaskStatus, type Task } from "../tasks.server";
import type { Route } from "./+types/board";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.org.name} — Tusker` }];
}

/**
 * The org this request is for, or a 404. A person outside the org gets the
 * same answer as one who named an org that does not exist.
 */
async function orgOr404(request: Request, env: Env, slug: string) {
  const person = await requirePerson(request, env);
  const org = await orgForMember(env.DB, slug, person.id);
  if (!org) throw new Response("Not found", { status: 404 });
  return org;
}

/** Which of the two hidden columns the query string asks for. */
function readToggles(params: URLSearchParams): Toggles {
  return { backlog: params.get("backlog") === "1", cancelled: params.get("cancelled") === "1" };
}

/** How many tasks each status holds, so the Backlog rule can read it. */
function countByStatus(tasks: Task[]): Record<Status, number> {
  const counts: Record<Status, number> = {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    done: 0,
    cancelled: 0,
  };
  for (const task of tasks) counts[task.status]++;
  return counts;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const org = await orgOr404(request, env, params.slug);

  const tasks = await listTasks(env.DB, org.id);
  const toggles = readToggles(new URL(request.url).searchParams);
  const columns = columnsToShow(countByStatus(tasks), toggles).map((status) => ({
    status,
    label: STATUS_LABEL[status],
    tasks: tasks.filter((task) => task.status === status),
  }));

  return { org: { slug: org.slug, name: org.name }, columns, toggles };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const org = await orgOr404(request, env, params.slug);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const status = form.get("status");
  if (!isStatus(status)) throw new Response("That is not a column.", { status: 400 });

  if (intent === "create") {
    const title = String(form.get("title") ?? "").trim();
    if (!title) return { error: "A task needs a title." };
    await createTask(env.DB, { orgId: org.id, title, status });
    return { ok: true };
  }

  if (intent === "move") {
    const id = String(form.get("id") ?? "");
    const moved = await setTaskStatus(env.DB, { orgId: org.id, taskId: id, status });
    if (!moved) throw new Response("Not found", { status: 404 });
    return { ok: true };
  }

  throw new Response("That form does not name an action.", { status: 400 });
}

/**
 * The box at the top of a column. It posts on Enter and empties itself once
 * the task lands, so a person can type the next one straight away.
 */
function QuickAdd({ status, label }: { status: Status; label: string }) {
  const add = useFetcher();
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (add.state === "idle" && add.data?.ok) form.current?.reset();
  }, [add.state, add.data]);

  return (
    <add.Form method="post" ref={form} className="flex flex-col gap-2">
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="status" value={status} />
      <input name="title" placeholder={`Add to ${label}`} aria-label={`Add to ${label}`} className={fieldClass} />
      <button className="sr-only">Add</button>
    </add.Form>
  );
}

/** The link that turns one hidden column on or off, keeping the other one. */
function Toggle({ which, toggles }: { which: "backlog" | "cancelled"; toggles: Toggles }) {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  if (toggles[which]) next.delete(which);
  else next.set(which, "1");
  const query = next.toString();

  return (
    <Link to={query ? `?${query}` : "?"} className="underline" aria-pressed={toggles[which]}>
      {toggles[which] ? "Hide" : "Show"} {STATUS_LABEL[which]}
    </Link>
  );
}

export default function Board({ loaderData }: Route.ComponentProps) {
  const { org, columns, toggles } = loaderData;
  const move = useFetcher();

  /** A drop tells the server the card's new column. The loader then reloads. */
  function drop(status: Status, event: React.DragEvent) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    if (id) move.submit({ intent: "move", id, status }, { method: "post" });
  }

  return (
    <main className="flex min-h-full flex-col gap-6 p-8">
      <header className="flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <nav className="flex gap-4 text-sm">
          <Toggle which="backlog" toggles={toggles} />
          <Toggle which="cancelled" toggles={toggles} />
          <Link to="/me" className="underline">
            You
          </Link>
        </nav>
      </header>

      <div className="flex flex-1 gap-4 overflow-x-auto">
        {columns.map((column) => (
          <section
            key={column.status}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => drop(column.status, event)}
            className="flex w-72 shrink-0 flex-col gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
          >
            <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
              {column.label} <span className="text-neutral-400">{column.tasks.length}</span>
            </h2>

            <QuickAdd status={column.status} label={column.label} />

            <ul className="flex flex-col gap-2">
              {column.tasks.map((task) => (
                <li
                  key={task.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)}
                  className="cursor-grab rounded border border-neutral-200 bg-white p-3 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                >
                  {task.title}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
