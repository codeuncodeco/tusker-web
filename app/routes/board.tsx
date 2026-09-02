import { useEffect } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";

import {
  BOARD_TOGGLES,
  STATUSES,
  STATUS_LABEL,
  backlogByRule,
  columnsToShow,
  isFinished,
  readStatus,
  readToday,
  readToggles,
  type Status,
} from "../board";
import { archiveTasks, readTaskIds, restoreTasks } from "../archive.server";
import { Toggle, TodayChip } from "../board-chrome";
import { drawsAssignees, type Assignee } from "../assignees";
import { assigneesByTask } from "../assignees.server";
import { listColors } from "../colors.server";
import { cloudflareEnv } from "../context.server";
import { dayOf } from "../day";
import { DecisionPrompt } from "../decision-prompt";
import { askedOn, decide, promptFor } from "../decisions.server";
import { Dot } from "../dot";
import { shownOnCard, type Shown } from "../fields";
import { listFields } from "../fields.server";
import { Initials } from "../initials";
import { QuickAddBox, useQuickAddDraft } from "../quick-add";
import { refLabels } from "../refs.server";
import { useLocalDay } from "../local-day";
import { readPlan } from "../plans.server";
import { requireScope } from "../scope.server";
import { createTasks, listTasks, moveTask, newTasksFrom, type Task } from "../tasks.server";
import type { Route } from "./+types/board";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.org.name} — Tusker` }];
}

/** What one card shows. The task page reads the rest of the row. */
type Card = { id: string; title: string; fields: Shown[]; assignees: Assignee[] };

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
  const scope = await requireScope(request, env, params.slug, context);

  const tasks = await listTasks(env.DB, scope);
  // The org's declarations decide what a card shows, so the board needs no
  // code for any one org's fields.
  const declared = await listFields(env.DB, scope);
  // A reference card shows the cached label. The board does no live lookup: a
  // column of misses would be a column of calls to the org app.
  const labels = await refLabels(env.DB, scope);
  // The colour one value carries, so a card tells one client from another at a
  // glance. One query covers every card. See ADR-0006.
  const colors = await listColors(env.DB, scope);
  // Who holds each task, for the whole org in one read. A personal org holds
  // one member, so it draws none. See ADR-0013.
  const assignees = drawsAssignees(scope.org)
    ? await assigneesByTask(env.DB, scope)
    : new Map<string, Assignee[]>();
  // The chip narrows the board to the tasks today's plan holds. A null plan is
  // a day the person has not planned, and then the board offers no chip.
  const day = dayOf(request);
  const plan = await readPlan(env.DB, scope.personId, day);
  const query = new URL(request.url).searchParams;
  // An emptied plan holds nothing to narrow to, so it carries no chip either.
  const held = new Set(plan ?? []);
  const hasPlan = held.size > 0;
  const today = readToday(query) && hasPlan;
  const shown = today ? tasks.filter((task) => held.has(task.id)) : tasks;

  // The Backlog rule reads the whole board, so narrowing does not change which
  // columns a person sees. Clearing the chip gives the board back as it was.
  const counts = countByStatus(tasks);
  const toggles = readToggles(query, BOARD_TOGGLES);
  const columns = columnsToShow(counts, toggles).map((status) => ({
    status,
    label: STATUS_LABEL[status],
    // Only the finished columns sweep. Archive keeps finished work; live work
    // belongs on the board.
    sweeps: isFinished(status),
    tasks: shown
      .filter((task) => task.status === status)
      .map(
        (task): Card => ({
          id: task.id,
          title: task.title,
          fields: shownOnCard(declared, task.data, labels, colors),
          assignees: assignees.get(task.id) ?? [],
        }),
      ),
  }));

  return {
    org: { slug: scope.org.slug, name: scope.org.name },
    columns,
    // The prompt a finished card raised, if the query string still holds one.
    ask: await askedOn(env.DB, scope, request),
    toggles,
    today,
    day,
    /** Today's plan holds a task, so the chip has something to narrow to. */
    hasPlan,
    // The rule can show Backlog on its own, and then the toggle has nothing to
    // add. The header reads this to leave the toggle out.
    backlogByRule: backlogByRule(counts),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "create") {
    const status = readStatus(form);
    const typed = newTasksFrom(form);
    if ("error" in typed) return typed;
    const made = await createTasks(env.DB, scope, { ...typed, status });
    // The box sits on every column, Done included. A marked task typed
    // straight into Done is finished the moment it is made, so it is asked
    // now: no later move would ask it. One box is one prompt, so a pasted list
    // is asked about the task on top of it.
    const prompt = await promptFor(env.DB, scope, request, made[0]);
    if (prompt) return prompt;
    return { ok: true };
  }

  if (intent === "move") {
    const status = readStatus(form);
    const id = String(form.get("id") ?? "");
    // The card the task lands above. Nothing named means the bottom.
    const before = String(form.get("before") ?? "") || null;
    const moved = await moveTask(env.DB, scope, { taskId: id, status, before });
    if (!moved.moved) throw new Response("Not found", { status: 404 });
    // A card dropped into Done is a task finished, and a marked task is the
    // one Tusker asks about.
    if (moved.finished) {
      const prompt = await promptFor(env.DB, scope, request, id);
      if (prompt) return prompt;
    }
    return { ok: true };
  }

  // The sweep of one column. The form carries the ids of the cards that were
  // on screen, so the filters and the search that left them there decide the
  // set: the server re-reads nothing and can archive nothing the person could
  // not see.
  if (intent === "archive") {
    return { archived: await archiveTasks(env.DB, scope, readTaskIds(form)) };
  }

  // One undo for the whole batch. It names the ids the sweep changed, so a
  // task already archived before the sweep stays archived.
  if (intent === "restore") {
    await restoreTasks(env.DB, scope, readTaskIds(form));
    return { ok: true };
  }

  // The prompt a finished card raised, answered.
  if (intent === "decide") return decide(env.DB, scope, request, form);

  throw new Response("That form does not name an action.", { status: 400 });
}

/**
 * The box at the top of a column. It posts on Enter and empties itself once
 * the tasks land, so a person can type the next one at once. The column names
 * the status, so the only extra this placement needs is a hidden field.
 */
function QuickAdd({ status, label }: { status: Status; label: string }) {
  const add = useFetcher<typeof action>();
  const draft = useQuickAddDraft();
  const error = add.data && "error" in add.data ? add.data.error : null;
  const { clear } = draft;

  useEffect(() => {
    if (add.state !== "idle" || !add.data || !("ok" in add.data)) return;
    clear();
  }, [add.state, add.data, clear]);

  return (
    <QuickAddBox
      form={add.Form}
      label={`Add to ${label}`}
      draft={draft}
      error={error}
      fields={<input type="hidden" name="status" value={status} />}
    />
  );
}

/**
 * The sweep of one column, and the one undo that puts the batch back.
 *
 * The form carries the id of every card the column draws, so the sweep
 * archives exactly what is on screen: the filters and the search that left
 * these cards here are the whole rule, and the server adds nothing to it.
 *
 * The undo names the ids the sweep changed, and not the ids it was given, so a
 * task somebody archived earlier is not restored by an undo of this sweep. One
 * sweep is one act, so its undo is one act.
 */
function ColumnSweep({ label, cards }: { label: string; cards: Card[] }) {
  const sweep = useFetcher<typeof action>();
  const archived = sweep.data && "archived" in sweep.data ? sweep.data.archived : null;

  return (
    <div className="flex flex-col gap-1 text-xs">
      {cards.length > 0 ? (
        <sweep.Form method="post">
          <input type="hidden" name="intent" value="archive" />
          {cards.map((card) => (
            <input key={card.id} type="hidden" name="id" value={card.id} />
          ))}
          <button
            aria-label={`Archive ${cards.length} from ${label}`}
            className="rounded border border-neutral-300 px-2 py-0.5 dark:border-neutral-700"
          >
            Archive {cards.length}
          </button>
        </sweep.Form>
      ) : null}

      {archived && archived.length > 0 ? (
        <sweep.Form method="post" className="flex items-baseline gap-2 text-neutral-500">
          <input type="hidden" name="intent" value="restore" />
          {archived.map((id) => (
            <input key={id} type="hidden" name="id" value={id} />
          ))}
          <span>Archived {archived.length}.</span>
          <button className="underline">Undo</button>
        </sweep.Form>
      ) : null}
    </div>
  );
}

/** What a drag asks for: the card, its column, and the card it lands above. */
type Move = (id: string, status: Status, before: string | null) => void;

/**
 * One card. It shows its rank, the way the extension did: the place the board
 * draws it in, counting from one. No row stores it.
 *
 * The select moves the card to another column, and the two arrows move it
 * inside one. Both sit in a form that posts on its own, so a move needs no
 * script. Tusker is keyboard first, so the drag is the second way, not the
 * only one.
 */
function CardItem({
  cards,
  index,
  status,
  slug,
  move,
}: {
  cards: Card[];
  index: number;
  status: Status;
  slug: string;
  move: Move;
}) {
  const card = cards[index];
  const post = useFetcher();
  // Its own form, because a form posts one intent and a move is not an
  // archive.
  const archiver = useFetcher();

  // Up lands above the card overhead. Down lands above the card after the
  // next one, and an empty value names the bottom of the column.
  const up = index === 0 ? null : cards[index - 1].id;
  const down = index === cards.length - 1 ? null : (cards[index + 2]?.id ?? "");

  return (
    <li
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/plain", card.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        // The dragged card takes this one's place, so this one slides down.
        event.stopPropagation();
        event.preventDefault();
        const dragged = event.dataTransfer.getData("text/plain");
        if (dragged && dragged !== card.id) move(dragged, status, card.id);
      }}
      className="flex cursor-grab flex-col gap-2 rounded border border-neutral-200 bg-white p-3 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <span className="flex items-baseline gap-2">
        <span className="tabular-nums text-neutral-400">{index + 1}</span>
        <Link to={`/o/${slug}/t/${card.id}`} className="flex-1 underline-offset-2 hover:underline">
          {card.title}
        </Link>
        <Initials assignees={card.assignees} />
      </span>

      {card.fields.length > 0 ? (
        <ul className="flex flex-wrap gap-2 text-xs text-neutral-500">
          {card.fields.map((field) => (
            <li
              key={field.key}
              className="flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800"
            >
              <Dot color={field.color} />
              <span className="text-neutral-400">{field.label}</span> {field.value}
            </li>
          ))}
        </ul>
      ) : null}

      <post.Form method="post" className="flex gap-2">
        <input type="hidden" name="intent" value="move" />
        <input type="hidden" name="id" value={card.id} />
        <select
          name="status"
          aria-label={`Column for ${card.title}`}
          defaultValue={status}
          onChange={(event) => post.submit(event.currentTarget.form)}
          className="rounded border border-neutral-300 bg-transparent px-1 py-0.5 text-xs dark:border-neutral-700"
        >
          {STATUSES.map((one) => (
            <option key={one} value={one}>
              {STATUS_LABEL[one]}
            </option>
          ))}
        </select>
        {/* The submit the select needs when no script runs. */}
        <button name="before" value="" className="sr-only">
          Move
        </button>
        <button
          name="before"
          value={up ?? ""}
          disabled={up === null}
          aria-label={`Move ${card.title} up`}
          className="rounded border border-neutral-300 px-1 text-xs disabled:opacity-30 dark:border-neutral-700"
        >
          ↑
        </button>
        <button
          name="before"
          value={down ?? ""}
          disabled={down === null}
          aria-label={`Move ${card.title} down`}
          className="rounded border border-neutral-300 px-1 text-xs disabled:opacity-30 dark:border-neutral-700"
        >
          ↓
        </button>
      </post.Form>

      {/* One task, off the board and kept. It is offered where the work is
          finished, because archive holds finished work. */}
      {isFinished(status) ? (
        <archiver.Form method="post">
          <input type="hidden" name="intent" value="archive" />
          <input type="hidden" name="id" value={card.id} />
          <button
            aria-label={`Archive ${card.title}`}
            className="text-xs text-neutral-500 underline underline-offset-2"
          >
            Archive
          </button>
        </archiver.Form>
      ) : null}
    </li>
  );
}

export default function Board({ loaderData }: Route.ComponentProps) {
  const { org, columns, toggles, today, hasPlan, day, ask } = loaderData;
  const mover = useFetcher();

  // The chip speaks for today, so the board must know which day that is where
  // the person is, not where the Worker runs.
  useLocalDay(day);

  /**
   * The post a drag makes: the card, the column it lands in, and the card it
   * lands above. No card named means the bottom of the column. A card's own
   * form carries the moves the keyboard makes.
   */
  const move: Move = (id, status, before) => {
    mover.submit({ intent: "move", id, status, before: before ?? "" }, { method: "post" });
  };

  /** A drop on the column itself, past the last card, lands at the bottom. */
  function onDrop(status: Status, event: React.DragEvent) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    if (id) move(id, status, null);
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <nav className="flex items-baseline gap-4 text-sm">
          <TodayChip today={today} hasPlan={hasPlan} />
          {loaderData.backlogByRule ? null : <Toggle which="backlog" toggles={toggles} />}
          <Toggle which="cancelled" toggles={toggles} />
        </nav>
      </header>

      <div className="flex flex-1 gap-4 overflow-x-auto">
        {columns.map((column) => (
          <section
            key={column.status}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDrop(column.status, event)}
            className="flex w-72 shrink-0 flex-col gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
          >
            <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
              {column.label} <span className="text-neutral-400">{column.tasks.length}</span>
            </h2>

            <QuickAdd status={column.status} label={column.label} />

            {column.sweeps ? <ColumnSweep label={column.label} cards={column.tasks} /> : null}

            <ul className="flex flex-col gap-2">
              {column.tasks.map((card, index) => (
                <CardItem
                  key={card.id}
                  cards={column.tasks}
                  index={index}
                  status={column.status}
                  slug={org.slug}
                  move={move}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <DecisionPrompt ask={ask} />
    </main>
  );
}
