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
import { narrowingFor, STATUS_LABEL } from "../board";
import { TodayChip } from "../board-chrome";
import { listColors } from "../colors.server";
import { cloudflareEnv } from "../context.server";
import { dayDate, dayOf } from "../day";
import { Dot } from "../dot";
import { shownOnCard, type Shown } from "../fields";
import { listFields } from "../fields.server";
import { Initials } from "../initials";
import { useLocalDay } from "../local-day";
import { useTaskHref } from "../paths";
import { readPlan } from "../plans.server";
import { refLabels } from "../refs.server";
import { ModalControls } from "../route-modal";
import { requireScope } from "../scope.server";
import { Bento, Stat, Tile } from "../bento";
import { BoxArchive } from "../icons";
import type { Route } from "./+types/archive";
import type { TaskId } from "../task-number";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Archive — ${loaderData.org.name}` }];
}

/** One line of the list: what a card shows, and when it was archived. */
type Line = {
  id: TaskId;
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
    : new Map<TaskId, Assignee[]>();

  // The same chip the board carries, narrowing to the tasks today's plan
  // holds. A day with no plan offers nothing to narrow to. A plan keeps the
  // id of a task that was archived — the plan page drops it because no live
  // task answers for it — so the chip narrows this list as it narrows the
  // board.
  const day = dayOf(request);
  const plan = await readPlan(env.DB, scope.personId, day);
  const held = new Set(plan ?? []);
  const hasPlan = held.size > 0;
  // The archive draws no Week chip, so it hands the narrowing an empty set and
  // takes the Today half of the answer.
  const { today, ids } = narrowingFor(new URL(request.url).searchParams, held, new Set());
  const shown = ids ? tasks.filter((task) => ids.has(task.id)) : tasks;

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
function Restore({ id, title }: { id: TaskId; title: string }) {
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
  const hrefOf = useTaskHref();

  useLocalDay(day);

  // A bento: a head with the count and the Today chip, then one tile per
  // archived task, two abreast, each with its Restore. See ADR-0040.
  return (
    <main className="flex flex-col gap-3">
      <Bento>
        <Tile span={4} tone="plain" className="p-1!">
          <header className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-x-6 gap-y-2">
              <h1 className="font-serif text-3xl tracking-tight">Archive</h1>
              <Stat value={lines.length} word={lines.length === 1 ? "task kept" : "tasks kept"} />
              <nav className="ml-auto flex items-baseline gap-4">
                <TodayChip today={today} hasPlan={hasPlan} />
              </nav>
            </div>
            <ModalControls />
          </header>
        </Tile>

        {lines.length === 0 ? (
          <Tile span={4}>
            <p className="text-muted">
              Nothing archived yet. Finish some work, then sweep the Done column on the{" "}
              <Link to={`/o/${org.slug}/board`} className="underline">
                board
              </Link>
              .
            </p>
          </Tile>
        ) : (
          lines.map((line) => (
            <Tile
              key={line.id}
              span={2}
              label={`${line.status} · ${line.archivedAt ? dayDate(line.archivedAt.slice(0, 10)) : "—"}`}
              icon={<BoxArchive className="size-3" />}
              action={<Initials assignees={line.assignees} />}
            >
              <Link to={hrefOf(line.id)} className="font-medium underline-offset-2 hover:underline">
                {line.title}
              </Link>
              {line.fields.length > 0 ? (
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  {line.fields.map((field) => (
                    <span key={field.key} className="flex items-center gap-1">
                      <Dot color={field.color} />
                      <span className="text-dim">{field.label}</span> {field.value}
                    </span>
                  ))}
                </span>
              ) : null}
              <div className="mt-auto">
                <Restore id={line.id} title={line.title} />
              </div>
            </Tile>
          ))
        )}
      </Bento>
    </main>
  );
}
