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
import {
  AssigneeFilter,
  ColumnSwitch,
  FieldFilterSelect,
  SearchBox,
  TodayChip,
  WeekChip,
} from "../board-chrome";
import { ColumnSweep } from "../column-sweep";
import { landing } from "../drag";
import { DragCopy, DragLists, DropList, Grip, useDragItem, type Drop } from "../drag-lists";
import { useBoardKeys } from "../board-keys";
import { ANYONE, keeps, readAssignee, seededBy } from "../assignee-filter";
import { drawsAssignees, type Assignee } from "../assignees";
import { assigneesByTask, membersOf, readAssignees } from "../assignees.server";
import { AssigneePicker } from "../assignee-picker";
import { listColors } from "../colors.server";
import { cloudflareEnv } from "../context.server";
import { dayOf } from "../day";
import { DecisionPrompt } from "../decision-prompt";
import { askedOn, decide, promptFor } from "../decisions.server";
import { Dot } from "../dot";
import {
  filterSelects,
  fieldName,
  keepsFields,
  narrowedData,
  readFieldValues,
  type FieldFilter,
} from "../field-filter";
import { shownOnCard, type Shown } from "../fields";
import { listFields } from "../fields.server";
import { Initials } from "../initials";
import { QuickAddBox, useAddKey, useQuickAddDraft, useSendDraft } from "../quick-add";
import { refLabels, refOptionsOfOrg } from "../refs.server";
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
import { revealCursor, TopRow, TopRowBox } from "../top-row";
import type { Route } from "./+types/board";
import { readTaskId, type TaskId } from "../task-number";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.org.name} — Tusker` }];
}

/** What one card shows. The task page reads the rest of the row. */
type Card = { id: TaskId; title: string; fields: Shown[]; assignees: Assignee[] };

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
  // waits on the other. An org of one draws no assignee, so it draws neither
  // control, and it holds no filter either, whatever the address says.
  // See ADR-0013 and ADR-0017.
  const draws = drawsAssignees(scope.org);
  const [assignees, members] = draws
    ? await Promise.all([assigneesByTask(env.DB, scope), membersOf(env.DB, scope)])
    : [new Map<TaskId, Assignee[]>(), [] as Assignee[]];
  const assignee = draws ? readAssignee(query) : ANYONE;
  // One select per field the org marks filterable, and the values the address
  // narrows by. A value for a field that draws no select is ignored, so an old
  // link still opens. A reference offers its cached refs, read for the whole
  // org in one go.
  const fieldValues = readFieldValues(query, declared);
  const refs = await refOptionsOfOrg(env.DB, scope);
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
  // Every narrowing is AND, and the filters narrow what the chip left, in
  // memory over the map the initials already needed and the data every card
  // already carries. A name no member answers
  // to keeps nothing, which is the honest board for a member who left: their
  // assignments left with them.
  const shown = tasks.filter(
    (task) =>
      (!ids || ids.has(task.id)) &&
      keeps(assignee, assignees.get(task.id) ?? []) &&
      keepsFields(fieldValues, task.data),
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
    /** One select per filterable field, each holding the value it narrows by. */
    filters: filterSelects(declared, fieldValues, refs),
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
    // The board's field filters ride along. See `QuickAdd`.
    const data = narrowedData(await listFields(env.DB, scope), form);
    await createTasks(env.DB, scope, { ...typed, status, assignees: assigned.ids, data });
    return { ok: true };
  }

  if (intent === "move") {
    const status = readStatus(form);
    const id = readTaskId(form.get("id"));
    if (id === null) throw new Response("Not found", { status: 404 });
    // The card the task lands above. Nothing named means the bottom.
    const before = readTaskId(form.get("before"));
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
    const id = readTaskId(form.get("id"));
    if (id === null) throw new Response("Not found", { status: 404 });
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
 * person filing three tasks to one member names them once. An org of one
 * hands it no member and it draws nothing. See ADR-0013.
 *
 * The box takes the board's narrowing, as the extension did: a board narrowed
 * to one member starts the picker with that member, and a board narrowed to
 * one field value gives every task the box makes that value.
 *
 * `n` focuses the box and Escape gives the board its keys back, as they do on
 * the unified board.
 */
function QuickAdd({
  members,
  assignee,
  filters,
}: {
  /** The org's members. Empty for an org of one, which draws no picker. */
  members: Assignee[];
  /** The assignee filter's value, which seeds the picker with one member. */
  assignee: string;
  /** The field filters, whose active values every task the box makes holds. */
  filters: FieldFilter[];
}) {
  const add = useFetcher<typeof action>();
  const draft = useQuickAddDraft(seededBy(assignee, members));
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
      // The active field filters, which the action reads against the org's
      // declarations.
      fields={filters
        .filter((one) => one.value)
        .map((one) => (
          <input key={one.key} type="hidden" name={fieldName(one.key)} value={one.value} />
        ))}
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
type Move = (id: TaskId, status: Status, before?: TaskId | null) => void;

/**
 * One card. It carries no reorder button. A drag from its grip places it, and
 * the keys step it: `>` and `<` move the card to another column, and `J` and
 * `K` step it inside its column. See ADR-0016 and ADR-0026.
 *
 * It carries no Archive button either: a control never adds a line to a card.
 * One task is archived from its own page, or by narrowing the column and
 * sweeping it. See ADR-0026.
 */
function CardItem({
  card,
  selected,
  domId,
  place,
}: {
  card: Card;
  selected: boolean;
  domId: string;
  /**
   * Puts the keyboard cursor on this card. The keys act on the cursor, and `j`
   * was the only way to move it: on a long column that put them near the top
   * and nowhere else. See ADR-0015.
   */
  place: () => void;
}) {
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
        <Link
          to={taskPath(card.id, origin)}
          className="flex-1 underline-offset-2 hover:underline"
        >
          {card.title}
        </Link>
        <Initials assignees={card.assignees} />
      </span>

      {/* One line: a pill that does not fit is cut off, and never wraps. */}
      {card.fields.length > 0 ? (
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
  const { assignee, filters } = loaderData;
  // The board as the server holds it, with every post still in flight laid
  // over it, so a move or a step shows before the server answers. See #168.
  const sent = useSent();
  const columns = boardSent(loaderData.columns, sent);
  // Each press posts on its own, so a held key is every press and not the
  // last one: the board draws all of them while they are in flight.
  const post = usePost();
  const [on, setOn] = useState<TaskId | null>(null);
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
    post({ intent: "move", id: String(id), status, before: String(before ?? "") });
  };

  /**
   * The post `J` and `K` make: the card and the way. It names no place, so the
   * server reads the card the step lands above out of the order as it stands.
   */
  const step = (id: TaskId, way: "up" | "down") => {
    setOn(id);
    post({ intent: way, id: String(id) });
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
    cursor,
    setOn,
    move,
    step,
  );

  // The cursor follows the keys down a column longer than the window, and
  // stays clear of the Top row stuck over it.
  useEffect(() => revealCursor(board.current), [cursor]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <TopRow>
        {/* One box for the board, outside every keyed list, so a typed word is
            never a press the page reads. See ADR-0022. */}
        <TopRowBox>
          <QuickAdd members={members} assignee={assignee} filters={filters} />
        </TopRowBox>
        {/* The filters take the rest of the row, and wrap under the box where
            they do not fit beside it. */}
        <nav className="flex flex-1 flex-wrap items-baseline justify-end gap-4">
          <SearchBox search={search} />
          <AssigneeFilter assignee={assignee} members={members} />
          {filters.map((filter) => (
            <FieldFilterSelect key={filter.key} filter={filter} />
          ))}
          <TodayChip today={today} hasPlan={hasPlan} />
          <WeekChip week={week} hasSet={hasSet} />
          {loaderData.backlogByRule ? null : <ColumnSwitch which="backlog" toggles={toggles} />}
          <ColumnSwitch which="cancelled" toggles={toggles} />
        </nav>
      </TopRow>

      <DragLists
        lists={Object.fromEntries(
          columns.map((column) => [column.status, column.tasks.map((one) => one.id)]),
        )}
        onDrop={onDrop}
        overlay={(id) => <DragCopy title={cards.get(id)?.title ?? ""} />}
      >
        {(shown) => (
          // Each column is as long as its cards, and the page scrolls. The
          // columns are panes: a divider splits them, and a card is the one
          // thing on the board with an edge. See #184 and #191.
          <div ref={board} className="flex flex-1 divide-x divide-border overflow-x-auto">
            {columns.map((column) => {
              const drawn = shown[column.status].flatMap((id) => cards.get(id) ?? []);
              return (
                <section
                  key={column.status}
                  // Every column takes an equal share of the width, down to the
                  // width it always had. Past that the row scrolls sideways.
                  className="flex min-w-72 flex-1 flex-col gap-3 px-4 first:pl-0 last:pr-0"
                >
                  <div className="flex items-baseline gap-3">
                    <h2 className="font-mono uppercase tracking-wide text-muted">
                      {column.label} <span className="text-dim">{column.tasks.length}</span>
                    </h2>
                    {/* The sweep acts on the whole column, so it is column chrome.
                        It sits with the name and the count, the way the extension
                        drew it, so the act on the column is where the column says
                        what it holds. The head scrolls away with the column's
                        cards. */}
                    {isFinished(column.status) ? (
                      <ColumnSweep
                        label={column.label}
                        cards={column.tasks.map((card) => ({ id: card.id, slug: org.slug }))}
                        undoAt={`/o/${org.slug}/board`}
                      />
                    ) : null}
                  </div>

                  {/* This is the keyed list: the cards and nothing else. It is
                      as long as its cards, and the page scrolls, not the list.
                      It fills the rest of a short column, so a drop below the
                      last card still lands in it. The focus outline is drawn
                      inside, as the row clips what is past its edge, and the
                      floor gives an empty column a box to draw it on. See
                      #193. */}
                  <DropList
                    id={column.status}
                    ids={drawn.map((one) => one.id)}
                    props={keyed(`${column.label} tasks`)}
                    className="flex min-h-12 flex-1 flex-col gap-2 focus-visible:-outline-offset-2"
                  >
                    {/* The box files into To do, so an add in flight draws there. */}
                    {column.status === "todo" ? <PendingAdds titles={addsSent(sent)} /> : null}
                    {drawn.map((card) => (
                      <CardItem
                        key={card.id}
                        card={card}
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
