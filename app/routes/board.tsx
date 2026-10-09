/**
 * The org board: one org's five columns, at `/o/:slug/board`.
 *
 * The order inside a column is the org's and it is stored, so this is the one
 * board where `J` and `K` step a card. A drag draws where the card will land,
 * and the drop writes that place. See ADR-0025.
 * The keys are in `app/board-keys.ts`, and they are the letters the cross-org
 * lists bind, so a person who learns the board on `/me` finds it here.
 * See ADR-0016.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";

import {
  BOARD_TOGGLES,
  addStatus,
  STATUS_LABEL,
  backlogByRule,
  columnsToShow,
  isFinished,
  readStatus,
  narrowingFor,
  readToggles,
  type Status,
} from "../board";
import { archiveTasks, readTaskIds, restoreTasks } from "../archive.server";
import { AssigneeFilter, ColumnSwitch, SearchBox, TodayChip, WeekChip } from "../board-chrome";
import { ColumnSweep } from "../column-sweep";
import { landing } from "../drag";
import { DragCopy, DragLists, DropList, Grip, useDragItem, type Drop } from "../drag-lists";
import { useBoardKeys } from "../board-keys";
import { ANYONE, keeps, readAssignee } from "../assignee-filter";
import { drawsAssignees, type Assignee } from "../assignees";
import { assigneesByTask, membersOf, readAssignees } from "../assignees.server";
import { AssigneePicker } from "../assignee-picker";
import { listColors } from "../colors.server";
import { cloudflareEnv } from "../context.server";
import { dayOf } from "../day";
import { DecisionPrompt } from "../decision-prompt";
import { askedOn, decide, promptFor } from "../decisions.server";
import { Dot } from "../dot";
import { shownOnCard, type Shown } from "../fields";
import { listFields } from "../fields.server";
import { Initials } from "../initials";
import { KeyLegend } from "../key-hint";
import { QuickAddBox, useAddKey, useQuickAddDraft, useSendDraft } from "../quick-add";
import { refLabels } from "../refs.server";
import { useLocalDay } from "../local-day";
import { taskPath, useOrigin } from "../paths";
import { addsSent, boardSent, postAndReport, usePost, useSent } from "../pending";
import { PendingAdds } from "../pending-adds";
import { readPlan } from "../plans.server";
import { weekOf } from "../week";
import { readWeekSet } from "../weeks.server";
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
import type { Route } from "./+types/board";

/** The board holds still and scrolls inside its columns. See `app/frame.ts`. */
export const handle = { frame: true };

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
  // Who holds each task, for the whole org in one read, and the org's members
  // beside it: one list for the picker the quick-add box carries and for the
  // filter select in the header. The two reads go together, because neither
  // waits on the other. A personal org draws no assignee, so it draws neither
  // control, and it holds no filter either, whatever the address says.
  // See ADR-0013 and ADR-0017.
  const draws = drawsAssignees(scope.org);
  const [assignees, members] = draws
    ? await Promise.all([assigneesByTask(env.DB, scope), membersOf(env.DB, scope)])
    : [new Map<string, Assignee[]>(), [] as Assignee[]];
  const assignee = draws ? readAssignee(query) : ANYONE;
  // The two chips narrow the board to today's plan, or to this week's set. A
  // null plan is a day the person has not planned, and then the chip leads to
  // plan mode instead. An emptied plan holds nothing to narrow to, so it reads
  // the same way, and the week set beside it reads the same way again.
  const day = dayOf(request);
  const [plan, weekSet] = await Promise.all([
    readPlan(env.DB, scope.personId, day),
    readWeekSet(env.DB, scope.personId, weekOf(day)),
  ]);
  const held = new Set(plan ?? []);
  const inWeek = new Set(weekSet ?? []);
  // A board is narrowed by Today, by Week, or by neither. See ADR-0014.
  const { today, week, ids } = narrowingFor(query, held, inWeek);
  // Every narrowing is AND, and the filter narrows what the chip left, in
  // memory over the map the initials already needed. A name no member answers
  // to keeps nothing, which is the honest board for a member who left: their
  // assignments left with them.
  const shown = tasks.filter(
    (task) => (!ids || ids.has(task.id)) && keeps(assignee, assignees.get(task.id) ?? []),
  );

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
    /**
     * The org's members, in name order: the picker on the box offers them,
     * and so does the filter select. Empty draws neither.
     */
    members,
    // The prompt a finished card raised, if the query string still holds one.
    ask: await askedOn(env.DB, scope, request),
    toggles,
    today,
    week,
    /** The text the box holds, so a reload draws the search it ran. */
    search,
    /** The value the select holds, so a reload draws the filter it ran. */
    assignee,
    day,
    /** Today's plan holds a task, so the chip has something to narrow to. */
    hasPlan: held.size > 0,
    /** This week's set holds a task, so its chip narrows rather than leads. */
    hasSet: inWeek.size > 0,
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
    const status = addStatus(form);
    const typed = newTasksFrom(form);
    if ("error" in typed) return typed;
    // The ids are checked before anything is written, so an add naming a
    // member who left the org while the box sat open makes no task at all. The
    // box keeps the words, so nothing typed is lost. See ADR-0013.
    const assigned = await readAssignees(env.DB, scope, form);
    if ("error" in assigned) return assigned;
    const made = await createTasks(env.DB, scope, { ...typed, status, assignees: assigned.ids });
    // A post that names Done makes a task finished the moment it is made, so
    // a marked one is asked now: no later move would ask it. One add is one
    // prompt, so a pasted list is asked about the task on top of it.
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
    // The cards go back named as they were posted, org and all, because the
    // toast that reports the sweep is the unified board's toast as well.
    const archived = await archiveTasks(env.DB, scope, readTaskIds(form));
    return {
      changed: archived.map((id) => ({ id, slug: scope.org.slug })),
      partial: false,
    };
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

/** A post the server refuses raises a toast, not the error page. See `app/pending.ts`. */
export const clientAction = (args: Route.ClientActionArgs) => postAndReport(args);

/**
 * The board's one box, above the columns. It posts on Enter and empties itself
 * once the tasks land, so a person can type the next one at once. It names no
 * column, so what it adds lands in To do. A task meant for another column is
 * added and then moved.
 *
 * The picker names who holds the task. It keeps its set across an add, so a
 * person filing three tasks to one member names them once. A personal org
 * hands it no member and it draws nothing. See ADR-0013.
 *
 * `n` focuses the box and Escape gives the board its keys back, as they do on
 * the unified board.
 */
function QuickAdd({
  members,
}: {
  /** The org's members. Empty for a personal org, which draws no picker. */
  members: Assignee[];
}) {
  const add = useFetcher<typeof action>();
  const draft = useQuickAddDraft();
  const error = add.data && "error" in add.data ? add.data.error : null;
  const box = useRef<HTMLTextAreaElement>(null);

  useAddKey(box);
  // The box empties as the add is posted, and the task draws in To do at
  // once, so the next one can be typed while the first is on its way.
  useSendDraft(add, draft);

  return (
    <QuickAddBox
      form={add.Form}
      busy={add.state !== "idle"}
      label="Add to To do"
      draft={draft}
      error={error}
      titleRef={box}
      bare
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        (event.target as HTMLElement).blur();
      }}
      picker={
        <AssigneePicker
          members={members}
          picked={draft.assignees}
          onPick={draft.setAssignees}
        />
      }
    />
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
 * A card carries no reorder button. A drag from its grip places it, and the
 * keys step it: `>` and `<` move the card to another column, and `J` and `K`
 * step it inside its column. See ADR-0016 and ADR-0026.
 *
 * It carries no Archive button either: a control never adds a line to a card.
 * One task is archived from its own page, or by narrowing the column and
 * sweeping it. See ADR-0026.
 *
 * The rank reads the order the drag holds, so a card dragged in from another
 * column counts its new place.
 */
function CardItem({
  cards,
  index,
  slug,
  selected,
  domId,
  place,
}: {
  cards: Card[];
  index: number;
  slug: string;
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
  const origin = useOrigin();
  const drag = useDragItem(card.id);

  return (
    <li
      id={domId}
      aria-current={selected ? "true" : undefined}
      onClick={place}
      ref={drag.ref}
      style={drag.style}
      // The card being dragged stays faded where it will land, and the copy
      // under the pointer is the one that moves.
      className={`flex flex-col gap-2 rounded border p-3 shadow-sm ${
        selected ? "border-fg bg-surface-2" : "border-border bg-surface"
      } ${drag.dragging ? "opacity-40" : ""}`}
    >
      <span className="flex items-baseline gap-2">
        <Grip grip={drag.grip} />
        <span className="tabular-nums text-dim">{index + 1}</span>
        <Link
          to={taskPath(slug, card.id, origin)}
          className="flex-1 underline-offset-2 hover:underline"
        >
          {card.title}
        </Link>
        <Initials assignees={card.assignees} />
      </span>

      {card.fields.length > 0 ? (
        // One line: a pill that does not fit is cut off, and never wraps.
        <ul className="flex gap-2 overflow-hidden text-xs text-muted">
          {card.fields.map((field) => (
            <li
              key={field.key}
              className="flex items-center gap-1 whitespace-nowrap rounded bg-surface-2 px-1.5 py-0.5"
            >
              <Dot color={field.color} />
              <span className="text-dim">{field.label}</span> {field.value}
            </li>
          ))}
        </ul>
      ) : null}

    </li>
  );
}

export default function Board({ loaderData }: Route.ComponentProps) {
  const { org, members, toggles, today, hasPlan, week, hasSet, day, ask, search } = loaderData;
  const { assignee } = loaderData;
  // The board as the server holds it, with every post still in flight laid
  // over it, so a move or a step shows before the server answers. See #168.
  const sent = useSent();
  const columns = boardSent(loaderData.columns, sent);
  // Each press posts on its own, so a held key is every press and not the
  // last one: the board draws all of them while they are in flight.
  const post = usePost();
  const [on, setOn] = useState<string | null>(null);
  const board = useRef<HTMLDivElement>(null);

  // The cursor starts empty, and stays on its own card while the board moves
  // under it. A card the board stops drawing takes the cursor off with it.
  // See ADR-0015.
  const rows = columns.flatMap((column) => column.tasks);
  const cursor = rows.some((one) => one.id === on) ? on : null;

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
    post({ intent: "move", id, status, before: before ?? "" });
  };

  /**
   * The post `J` and `K` make: the card and the way. It names no place, so the
   * server reads the card the step lands above out of the order as it stands.
   */
  const step = (id: string, way: "up" | "down") => {
    setOn(id);
    post({ intent: way, id });
  };

  /**
   * A drop lands where the drag drew it: above the card just below it, or at
   * the bottom of the column. This order is stored, so the place holds.
   * See ADR-0025.
   */
  function onDrop({ id, list, order }: Drop) {
    move(id, list as Status, landing(order, id));
  }

  // Every card the board draws, by id, so a column the drag reorders can draw
  // its cards in the order it holds.
  const cards = new Map(rows.map((one) => [one.id, one]));

  // The keys post what the card's own controls post. The board hands them the
  // ids it draws, in board order, because a key that steps the order needs the
  // column the card sits in. See ADR-0016.
  // The keys are live while focus is in one of the card lists below, and the
  // arrows cross the columns the letters walk. See ADR-0022.
  const keyed = useBoardKeys(
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
    <main className="flex flex-1 flex-col gap-6 p-8 sm:min-h-0">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl tracking-tight">{org.name}</h1>
        <nav className="flex items-baseline gap-4">
          <SearchBox search={search} />
          <AssigneeFilter assignee={assignee} members={members} />
          <TodayChip today={today} hasPlan={hasPlan} />
          <WeekChip week={week} hasSet={hasSet} />
          {loaderData.backlogByRule ? null : <ColumnSwitch which="backlog" toggles={toggles} />}
          <ColumnSwitch which="cancelled" toggles={toggles} />
        </nav>
      </header>

      {/* One box for the board, outside every keyed list, so a typed word is
          never a press the page reads. See ADR-0022. */}
      <QuickAdd members={members} />

      {/* A card carries no reorder button, so the keys that step it are named
          once, here. See ADR-0026. */}
      <KeyLegend acts={["up", "down"]} />

      <DragLists
        lists={Object.fromEntries(
          columns.map((column) => [column.status, column.tasks.map((one) => one.id)]),
        )}
        onDrop={onDrop}
        overlay={(id) => <DragCopy title={cards.get(id)?.title ?? ""} />}
      >
        {(shown) => (
          // The row holds still, and each column scrolls inside itself.
          <div ref={board} className="flex flex-1 gap-4 overflow-x-auto sm:min-h-0">
            {columns.map((column) => {
              const drawn = shown[column.status].flatMap((id) => cards.get(id) ?? []);
              return (
                <section
                  key={column.status}
                  // Every column takes an equal share of the width, down to the
                  // width it always had. Past that the row scrolls sideways.
                  className="flex min-w-72 flex-1 flex-col gap-3 rounded-lg border border-border p-3"
                >
                  <div className="flex items-baseline gap-3">
                    <h2 className="font-mono uppercase tracking-wide text-muted">
                      {column.label} <span className="text-dim">{column.tasks.length}</span>
                    </h2>
                    {/* The sweep acts on the whole column, so it is column chrome.
                        It sits with the name and the count, the way the extension
                        drew it, so the act on the column is where the column says
                        what it holds. The head is pinned, so the sweep stays in
                        sight while the cards scroll. */}
                    {isFinished(column.status) ? (
                      <ColumnSweep
                        label={column.label}
                        cards={column.tasks.map((card) => ({ id: card.id, slug: org.slug }))}
                        undoAt={`/o/${org.slug}/board`}
                      />
                    ) : null}
                  </div>

                  {/* The heading and the sweep stay pinned, and only this
                      scrolls. The gutter is reserved, so a full column is as
                      wide as an empty one, which is the point of the equal
                      split.

                      This is the keyed list: the cards and nothing else. */}
                  <DropList
                    id={column.status}
                    ids={drawn.map((one) => one.id)}
                    props={keyed(`${column.label} tasks`)}
                    className="flex flex-col gap-2 [scrollbar-gutter:stable] sm:min-h-0 sm:flex-1 sm:overflow-y-auto"
                  >
                    {/* The box files into To do, so an add in flight draws there. */}
                    {column.status === "todo" ? <PendingAdds titles={addsSent(sent)} /> : null}
                    {drawn.map((card, index) => (
                      <CardItem
                        key={card.id}
                        cards={drawn}
                        index={index}
                        slug={org.slug}
                        selected={cursor === card.id}
                        domId={`card-${card.id}`}
                        place={() => setOn(card.id)}
                      />
                    ))}
                  </DropList>
                </section>
              );
            })}
          </div>
        )}
      </DragLists>

      <DecisionPrompt ask={ask} />
    </main>
  );
}
