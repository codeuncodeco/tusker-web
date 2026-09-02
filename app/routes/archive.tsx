/**
 * The archive: one org's archived tasks, newest archived first.
 *
 * It is a flat list and not a board. Archived work is a history a person
 * scans, not a pipeline they rearrange, so there are no columns and no drag.
 *
 * It reads the same narrowings the board reads, because a person sweeps a
 * filtered column and then looks for what they swept. The Cancelled toggle is
 * not one of them: the archive holds Cancelled tasks whatever the board says,
 * since a cancelled task is finished work like any other.
 */

import { useFetcher, Link } from "react-router";

import { listArchived, readTaskIds, restoreTasks } from "../archive.server";
import { drawsAssignees, type Assignee } from "../assignees";
import { assigneesByTask } from "../assignees.server";
import { readNarrowing, STATUS_LABEL } from "../board";
import { TodayChip } from "../board-chrome";
import { listColors } from "../colors.server";
import { cloudflareEnv } from "../context.server";
import { dayOf } from "../day";
import { Dot } from "../dot";
import { shownOnCard, type Shown } from "../fields";
import { listFields } from "../fields.server";
import { Initials } from "../initials";
import { useLocalDay } from "../local-day";
import { readPlan } from "../plans.server";
import { refLabels } from "../refs.server";
import { requireScope } from "../scope.server";
import type { Route } from "./+types/archive";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Archive — ${loaderData.org.name}` }];
}

/** One line of the list: what a card shows, and when it was archived. */
type Line = {
  id: string;
  title: string;
  status: string;
  archivedAt: string | null;
  fields: Shown[];
  assignees: Assignee[];
};

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);

  const tasks = await listArchived(env.DB, scope);
  const declared = await listFields(env.DB, scope);
  const labels = await refLabels(env.DB, scope);
  const colors = await listColors(env.DB, scope);
  const assignees = drawsAssignees(scope.org)
    ? await assigneesByTask(env.DB, scope)
    : new Map<string, Assignee[]>();

  // The same chip the board carries, narrowing to the tasks today's plan
  // holds. A day with no plan offers nothing to narrow to. A plan keeps the
  // id of a task that was archived — the plan page drops it because no live
  // task answers for it — so the chip narrows this list as it narrows the
  // board.
  const day = dayOf(request);
  const plan = await readPlan(env.DB, scope.personId, day);
  const held = new Set(plan ?? []);
  const hasPlan = held.size > 0;
  const today = readNarrowing(new URL(request.url).searchParams) === "today" && hasPlan;
  const shown = today ? tasks.filter((task) => held.has(task.id)) : tasks;

  return {
    org: { slug: scope.org.slug, name: scope.org.name },
    day,
    today,
    hasPlan,
    lines: shown.map(
      (task): Line => ({
        id: task.id,
        title: task.title,
        status: STATUS_LABEL[task.status],
        archivedAt: task.archived_at,
        // A reference card shows the cached label, as it does on the board.
        fields: shownOnCard(declared, task.data, labels, colors),
        assignees: assignees.get(task.id) ?? [],
      }),
    ),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);

  const form = await request.formData();
  if (String(form.get("intent") ?? "") !== "restore") {
    throw new Response("That form does not name an action.", { status: 400 });
  }

  await restoreTasks(env.DB, scope, readTaskIds(form));
  return { ok: true };
}

/** The button that puts one task back on the board, in the status it holds. */
function Restore({ id, title }: { id: string; title: string }) {
  const post = useFetcher();

  return (
    <post.Form method="post">
      <input type="hidden" name="intent" value="restore" />
      <input type="hidden" name="id" value={id} />
      <button
        aria-label={`Restore ${title}`}
        className="rounded border border-border px-2 py-0.5 text-xs"
      >
        Restore
      </button>
    </post.Form>
  );
}

export default function Archive({ loaderData }: Route.ComponentProps) {
  const { org, lines, today, hasPlan, day } = loaderData;

  useLocalDay(day);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl tracking-tight">Archive</h1>
        <nav className="flex items-baseline gap-4">
          <TodayChip today={today} hasPlan={hasPlan} />
        </nav>
      </header>

      {lines.length === 0 ? (
        <p className="text-muted">
          Nothing archived yet. Finish some work, then sweep the Done column on the{" "}
          <Link to={`/o/${org.slug}/board`} className="underline">
            board
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((line) => (
            <li
              key={line.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded border border-border p-3"
            >
              <Link
                to={`/o/${org.slug}/t/${line.id}`}
                className="flex-1 underline-offset-2 hover:underline"
              >
                {line.title}
              </Link>

              {line.fields.map((field) => (
                <span
                  key={field.key}
                  className="flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs"
                >
                  <Dot color={field.color} />
                  <span className="text-dim">{field.label}</span> {field.value}
                </span>
              ))}

              <Initials assignees={line.assignees} />
              <span className="text-xs uppercase tracking-wide text-muted">
                {line.status}
              </span>
              <span className="text-xs tabular-nums text-muted">
                {line.archivedAt?.slice(0, 10) ?? "—"}
              </span>
              <Restore id={line.id} title={line.title} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
