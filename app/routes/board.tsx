/**
 * The org board: one org's five columns, at `/o/:slug/board`.
 *
 * The order inside a column is the org's and it is stored, so this is the one
 * board where a card is dragged into a place and where `J` and `K` step it.
 * The keys are in `app/board-keys.ts`, and they are the letters the cross-org
 * lists bind, so a person who learns the board on `/me` finds it here.
 * See ADR-0016.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";

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
import { SearchBox, Toggle, TodayChip } from "../board-chrome";
import { useBoardKeys } from "../board-keys";
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
import { QuickAddBox, useAddKey, useQuickAddDraft } from "../quick-add";
import { refLabels } from "../refs.server";
import { useLocalDay } from "../local-day";
import { readPlan } from "../plans.server";
import { useRemembered } from "../remembered";
import { requireScope } from "../scope.server";
import { readSearch } from "../search";
import {
  countByStatus,
  createTasks,
  listTasks,
  moveTask,
  newTasksFrom,
  stepTask,
} from "../tasks.server";
import { useToast } from "../toast";
import type { Route } from "./+types/board";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.org.name} — Tusker` }];
}

/** What one card shows. The task page reads the rest of the row. */
type Card = { id: string; title: string; fields: Shown[]; assignees: Assignee[] };

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);

  const query = new URL(request.url).searchParams;
  // The search narrows in SQL, so a board of hundreds of rows sends back what
  // matches and nothing else.
  const search = readSearch(query);
  const tasks = await listTasks(env.DB, scope, search);
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
  // An emptied plan holds nothing to narrow to, so it carries no chip either.
  const held = new Set(plan ?? []);
  const hasPlan = held.size > 0;
  const today = readToday(query) && hasPlan;
  const shown = today ? tasks.filter((task) => held.has(task.id)) : tasks;

  // The Backlog rule reads the whole board, so narrowing does not change which
  // columns a person sees. Clearing the chip or the box gives the board back as
  // it was.
  const counts = await countByStatus(env.DB, scope);
  const toggles = readToggles(query, BOARD_TOGGLES);
  const columns = columnsToShow(counts, toggles).map((status) => ({
    status,
    label: STATUS_LABEL[status],
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
    /** The text the box holds, so a reload draws the search it ran. */
    search,
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

  // A step up or down the card's own column. The page names the card and the
  // way, and the server reads the neighbour it lands above: the page's copy of
  // the order is one load old, and a held key would post the same place twice.
  if (intent === "up" || intent === "down") {
    const id = String(form.get("id") ?? "");
    const stepped = await stepTask(env.DB, scope, { taskId: id, way: intent === "down" ? 1 : -1 });
    if (!stepped.moved) throw new Response("Not found", { status: 404 });
    return { ok: true };
  }

  // The sweep of one column. The form carries the ids of the cards that were
  // on screen, so whatever narrowed the board decides the set. The server
  // re-reads nothing, and it can archive nothing the person could not see.
  // One card posts this too, as a sweep of one.
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
 *
 * `n` focuses the box on the To do column and Escape gives the board its keys
 * back, as they do on the unified board. One key names one box.
 */
function QuickAdd({ status, label, addKey }: { status: Status; label: string; addKey: boolean }) {
  const add = useFetcher<typeof action>();
  const draft = useQuickAddDraft();
  const error = add.data && "error" in add.data ? add.data.error : null;
  const { clear } = draft;
  const box = useRef<HTMLTextAreaElement>(null);

  useAddKey(box, addKey);

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
      titleRef={box}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        (event.target as HTMLElement).blur();
      }}
      fields={<input type="hidden" name="status" value={status} />}
    />
  );
}

/**
 * The sweep of one column.
 *
 * The form carries the id of every card the column draws, so the sweep
 * archives exactly what is on screen: whatever narrowed the column is the
 * whole rule, and the server adds nothing to it. Narrowing decides the set and
 * never the button: a finished column that holds a card carries the sweep.
 *
 * It sits in the column head, beside the name and the count, and a column
 * holding nothing draws none.
 *
 * The batch reports itself in a toast, which holds the one undo. The undo
 * names the ids the sweep changed, and not the ids it was given, so a task
 * somebody archived earlier is not restored by an undo of this sweep. One
 * sweep is one act, so its undo is one act.
 */
function ColumnSweep({ label, cards, slug }: { label: string; cards: Card[]; slug: string }) {
  const sweep = useFetcher<typeof action>();
  const raise = useToast();
  const archived = sweep.data && "archived" in sweep.data ? sweep.data.archived : null;

  useEffect(() => {
    if (sweep.state !== "idle" || !archived || archived.length === 0) return;
    raise({
      text: `Archived ${archived.length} from ${label}.`,
      act: {
        label: "Undo",
        action: `/o/${slug}/board`,
        post: { intent: "restore", id: archived },
      },
    });
  }, [sweep.state, archived, raise, label, slug]);

  if (cards.length === 0) return null;

  return (
    <sweep.Form method="post">
      <input type="hidden" name="intent" value="archive" />
      {cards.map((card) => (
        <input key={card.id} type="hidden" name="id" value={card.id} />
      ))}
      <button
        aria-label={`Archive ${cards.length} from ${label}`}
        className="rounded border border-border px-2 py-0.5 text-xs"
      >
        Archive {cards.length}
      </button>
    </sweep.Form>
  );
}

/**
 * What a drag asks for: the card, its column, and the card it lands above. A
 * key names no card, and the move lands at the bottom of the column.
 */
type Move = (id: string, status: Status, before?: string | null) => void;

/**
 * One card. It shows its rank, the way the extension did: the place the board
 * draws it in, counting from one. No row stores it.
 *
 * The select moves the card to another column, and the two arrows step it
 * inside one. Each sits in a form that posts on its own, so neither needs a
 * script. Tusker is keyboard first, so the drag is the second way, not the
 * only one: `>` and `<` post what the select posts, and `J` and `K` post what
 * the arrows post. See ADR-0016.
 */
function CardItem({
  cards,
  index,
  status,
  slug,
  move,
  selected,
  domId,
  place,
}: {
  cards: Card[];
  index: number;
  status: Status;
  slug: string;
  move: Move;
  selected: boolean;
  domId: string;
  /**
   * Puts the keyboard cursor on this card. The keys act on the cursor, and `j`
   * was the only way to move it: on a long column that put them near the top
   * and nowhere else. See ADR-0015.
   */
  place: () => void;
}) {
  const card = cards[index];
  const post = useFetcher();
  const step = useFetcher();
  // Its own form, because a form posts one intent and a step is not an
  // archive.
  const archiver = useFetcher();

  return (
    <li
      id={domId}
      aria-current={selected ? "true" : undefined}
      onClick={place}
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
      className={`flex cursor-grab flex-col gap-2 rounded border p-3 shadow-sm ${
        selected ? "border-fg bg-surface-2" : "border-border bg-surface"
      }`}
    >
      <span className="flex items-baseline gap-2">
        <span className="tabular-nums text-dim">{index + 1}</span>
        <Link to={`/o/${slug}/t/${card.id}`} className="flex-1 underline-offset-2 hover:underline">
          {card.title}
        </Link>
        <Initials assignees={card.assignees} />
      </span>

      {card.fields.length > 0 ? (
        <ul className="flex flex-wrap gap-2 text-xs text-muted">
          {card.fields.map((field) => (
            <li
              key={field.key}
              className="flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5"
            >
              <Dot color={field.color} />
              <span className="text-dim">{field.label}</span> {field.value}
            </li>
          ))}
        </ul>
      ) : null}

      <span className="flex gap-2">
        {/* The select posts on its own, so a move needs no script. */}
        <post.Form method="post" className="flex">
          <input type="hidden" name="intent" value="move" />
          <input type="hidden" name="id" value={card.id} />
          <select
            name="status"
            aria-label={`Column for ${card.title}`}
            defaultValue={status}
            onChange={(event) => post.submit(event.currentTarget.form)}
            className="rounded border border-border bg-transparent px-1 py-0.5 text-xs"
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
        </post.Form>

        {/* The two arrows, which post what `J` and `K` post. A card at the top
            of its column cannot step up and one at the bottom cannot step
            down, and that is all the page decides: the place the step lands
            above is the server's, because this order is one load old. */}
        <step.Form method="post" className="flex gap-2">
          <input type="hidden" name="id" value={card.id} />
          <button
            name="intent"
            value="up"
            disabled={index === 0}
            aria-label={`Move ${card.title} up`}
            className="rounded border border-border px-1 text-xs disabled:opacity-30"
          >
            ↑
          </button>
          <button
            name="intent"
            value="down"
            disabled={index === cards.length - 1}
            aria-label={`Move ${card.title} down`}
            className="rounded border border-border px-1 text-xs disabled:opacity-30"
          >
            ↓
          </button>
        </step.Form>
      </span>

      {/* One task, off the board and kept. It is offered where the work is
          finished, because archive holds finished work. */}
      {isFinished(status) ? (
        <archiver.Form method="post">
          <input type="hidden" name="intent" value="archive" />
          <input type="hidden" name="id" value={card.id} />
          <button
            aria-label={`Archive ${card.title}`}
            className="text-xs text-muted underline underline-offset-2"
          >
            Archive
          </button>
        </archiver.Form>
      ) : null}
    </li>
  );
}

export default function Board({ loaderData }: Route.ComponentProps) {
  const { org, columns, toggles, today, hasPlan, day, ask, search } = loaderData;
  const mover = useFetcher();
  const [on, setOn] = useState<string | null>(null);
  const board = useRef<HTMLDivElement>(null);

  // The cursor starts on the first card the board draws, and stays on its own
  // card while the board moves under it.
  const rows = columns.flatMap((column) => column.tasks);
  const cursor = rows.some((one) => one.id === on) ? on : (rows[0]?.id ?? null);

  // The chip speaks for today, so the board must know which day that is where
  // the person is, not where the Worker runs.
  useLocalDay(day);

  // The last search comes back with the board it was run on.
  useRemembered(org.slug);

  /**
   * The post a drag makes: the card, the column it lands in, and the card it
   * lands above. No card named means the bottom of the column. `>`, `<` and
   * `x` post the same thing, naming no card.
   *
   * The cursor goes to the card that moved, whether a pointer or a key moved
   * it, so the person can see where it landed and keep working it.
   */
  const move: Move = (id, status, before = null) => {
    setOn(id);
    mover.submit({ intent: "move", id, status, before: before ?? "" }, { method: "post" });
  };

  /**
   * The post `J` and `K` make: the card and the way. It names no place, so the
   * server reads the card the step lands above out of the order as it stands.
   */
  const step = (id: string, way: "up" | "down") => {
    setOn(id);
    mover.submit({ intent: way, id }, { method: "post" });
  };

  /** A drop on the column itself, past the last card, lands at the bottom. */
  function onDrop(status: Status, event: React.DragEvent) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    if (id) move(id, status, null);
  }

  // The keys post what the card's own controls post. The board hands them the
  // ids it draws, in board order, because a key that steps the order needs the
  // column the card sits in. See ADR-0016.
  useBoardKeys(
    columns.map((column) => ({ status: column.status, ids: column.tasks.map((one) => one.id) })),
    org.slug,
    cursor,
    setOn,
    move,
    step,
  );

  // The cursor follows the keys down a column longer than the window.
  useEffect(() => {
    board.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl tracking-tight">{org.name}</h1>
        <nav className="flex items-baseline gap-4">
          <SearchBox search={search} />
          <TodayChip today={today} hasPlan={hasPlan} />
          {loaderData.backlogByRule ? null : <Toggle which="backlog" toggles={toggles} />}
          <Toggle which="cancelled" toggles={toggles} />
        </nav>
      </header>

      <div ref={board} className="flex flex-1 gap-4 overflow-x-auto">
        {columns.map((column) => (
          <section
            key={column.status}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDrop(column.status, event)}
            className="flex w-72 shrink-0 flex-col gap-3 rounded-lg border border-border p-3"
          >
            <div className="flex items-baseline gap-3">
              <h2 className="uppercase tracking-wide text-muted">
                {column.label} <span className="text-dim">{column.tasks.length}</span>
              </h2>
              {/* The sweep sits with the name and the count, the way the
                  extension drew it, so the act on the column is where the
                  column says what it holds. */}
              {isFinished(column.status) ? (
                <ColumnSweep label={column.label} cards={column.tasks} slug={org.slug} />
              ) : null}
            </div>

            {/* One key names one box, and To do is where an add goes by hand. */}
            <QuickAdd
              status={column.status}
              label={column.label}
              addKey={column.status === "todo"}
            />

            <ul className="flex flex-col gap-2">
              {column.tasks.map((card, index) => (
                <CardItem
                  key={card.id}
                  cards={column.tasks}
                  index={index}
                  status={column.status}
                  slug={org.slug}
                  move={move}
                  selected={cursor === card.id}
                  domId={`card-${card.id}`}
                  place={() => setOn(card.id)}
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
