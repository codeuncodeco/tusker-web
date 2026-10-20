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
import { Link, useFetcher, useSearchParams } from "react-router";

import {
  BOARD_TOGGLES,
  addStatus,
  STATUS_LABEL,
  backlogByRule,
  EMPTY_LINE,
  flipped,
  columnsToShow,
  isFinished,
  readStatus,
  narrowingFor,
  readToggles,
  type Status,
} from "../board";
import { archiveTasks, readTaskIds, restoreTasks } from "../archive.server";
import { AssigneeFilter, ColumnHead, FieldFilterSelect, SearchChip, TodayChip, WeekChip } from "../board-chrome";
import { BoardFilters, FilterRow } from "../search-panel";
import { CalendarDay, Folder, Search, Tag, Users } from "../icons";
import { BacklogDrawer, BacklogTab, CancelledSheet, CancelledTab, isSide, PutAway, SIDE_STATUSES, type SideStatus } from "../side-drawer";
import { ColumnSweep } from "../column-sweep";
import { landing } from "../drag";
import { DragCopy, DragLists, DropList, Grip, useDragItem, type Drop } from "../drag-lists";
import { useBoardKeys } from "../board-keys";
import { ANYONE, keeps, readBoardAssignee, seededBy } from "../assignee-filter";
import { drawsAssignees, type Assignee } from "../assignees";
import { assigneesByTask, membersOf, readAssignees } from "../assignees.server";
import { AssigneePicker } from "../assignee-picker";
import { listColors } from "../colors.server";
import { cloudflareEnv } from "../context.server";
import { dayOf } from "../day";
import { DecisionPrompt } from "../decision-prompt";
import { askedOn, decide, promptFor } from "../decisions.server";
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
import { ClientTag, clientPath } from "../client-tag";
import { colorCss } from "../colors";
import { FinishCircle } from "../finish-circle";
import { QuickAddBox, useAddKey, useQuickAddDraft, useSendDraft } from "../quick-add";
import { refLabels, refOptionsOfOrg } from "../refs.server";
import { useLocalDay } from "../local-day";
import { useTaskHref } from "../paths";
import { addsSent, boardSent, postAndReport, usePost, useSent } from "../pending";
import { PendingAdds } from "../pending-adds";
import { readPlan } from "../plans.server";
import { weekOf } from "../week";
import { readWeekSet } from "../weeks.server";
import { useRemembered } from "../remembered";
import { requireScope } from "../scope.server";
import { readSearch } from "../search";
import { countByStatus, createTasks, listTasks, moveTask, newTasksFrom, stepTask } from "../tasks.server";
import { revealCursor } from "../top-row";
import { ModalOutlet, useCloseTo } from "../route-modal";
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
  // A bare address is the reader's own work. See ADR-0035.
  const assignee = draws ? readBoardAssignee(query, scope.personId) : ANYONE;
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
    org: { slug: scope.org.slug, name: scope.org.name, color: scope.org.color },
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
    /** The reader, whom the filter names first and a bare address narrows to. */
    personId: scope.personId,
    /** One select per filterable field, each holding the value it narrows by. */
    filters: filterSelects(declared, fieldValues, refs, colors),
    day,
    /** Today's plan holds a task, so the chip has something to narrow to. */
    hasPlan: held.size > 0,
    /** This week's set holds a task, so its chip narrows rather than leads. */
    hasSet: inWeek.size > 0,
    // The rule can show Backlog on its own, and then the toggle has nothing to
    // add. The header reads this to leave the toggle out.
    backlogByRule: backlogByRule(counts),
    /** How many tasks wait in Backlog, for the bar it folds into. */
    backlogCount: counts.backlog,
    /** How many tasks Cancelled holds, for its tab. */
    cancelledCount: counts.cancelled,
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
      picker={<AssigneePicker members={members} picked={draft.assignees} onPick={draft.setAssignees} />}
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
  slug,
  finished,
  move,
  color,
}: {
  card: Card;
  selected: boolean;
  domId: string;
  /** The org's slug, which the client tag's page sits under. */
  slug: string;
  /** True for a card in Done or Cancelled: its ring is ticked. */
  finished: boolean;
  /** The board's move, which the ring posts as `x` does. */
  move: Move;
  /** The org's colour, which the burst of a finish takes. */
  color: string | null;
  /**
   * Puts the keyboard cursor on this card. The keys act on the cursor, and `j`
   * was the only way to move it: on a long column that put them near the top
   * and nowhere else. See ADR-0015.
   */
  place: () => void;
}) {
  const hrefOf = useTaskHref();
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
      className={`press-soft flex flex-col gap-2 rounded border p-3 shadow-sm hover:shadow-md ${
        selected ? "border-fg bg-surface-2" : "border-border bg-surface"
      } ${drag.dragging ? "opacity-40" : ""}`}
    >
      <span className="flex items-baseline gap-2">
        <Grip grip={drag.grip} />
        <FinishCircle
          finished={finished}
          title={card.title}
          color={color ? colorCss(color) : undefined}
          onFinish={() => move(card.id, "done")}
          onReopen={() => move(card.id, "todo")}
        />
        <Link to={hrefOf(card.id)} className="flex-1 underline-offset-2 hover:underline">
          {card.title}
        </Link>
        <Initials assignees={card.assignees} />
      </span>

      {/* One line: a pill that does not fit is cut off, and never wraps. */}
      {card.fields.length > 0 ? (
        <ul className="flex gap-2 overflow-hidden text-xs text-muted">
          {card.fields.map((field) =>
            // The client is a tag of its own, first, and opens the client's
            // page. See ADR-0036.
            field.client ? (
              <li key={field.key} className="flex">
                <ClientTag label={field.value} color={field.color} to={clientPath(slug, field.client.stored)} />
              </li>
            ) : (
              // Only the client carries a colour on a card. See ADR-0038.
              <li key={field.key} className="flex items-center gap-1 whitespace-nowrap px-0.5 py-0.5">
                <span className="text-dim">{field.label}</span> {field.value}
              </li>
            ),
          )}
        </ul>
      ) : null}
    </li>
  );
}

export default function Board({ loaderData }: Route.ComponentProps) {
  const closeTo = useCloseTo();
  const { org, members, toggles, today, hasPlan, week, hasSet, day, ask, search } = loaderData;
  const { assignee, filters } = loaderData;
  const [params] = useSearchParams();
  // The board as the server holds it, with every post still in flight laid
  // over it, so a move or a step shows before the server answers. See #168.
  const sent = useSent();
  // Backlog and Cancelled live in the drawer, and only a drawer pulled out
  // draws its column: the keys and the drag walk what is on screen. Backlog
  // the rule asks for is not pulled out for the person; its tab calls
  // instead. See ADR-0038.
  const open = SIDE_STATUSES.filter((one) => toggles[one]);
  const columns = boardSent(loaderData.columns, sent).filter(
    (column) => !isSide(column.status) || open.includes(column.status),
  );
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

  // The filters that narrow anything, which the search button counts. The
  // reader's own work is the start, so it counts for nothing. See ADR-0035.
  const active =
    (members.length > 0 && assignee !== loaderData.personId ? 1 : 0) +
    filters.filter((filter) => filter.value).length +
    (today || week ? 1 : 0) +
    (search ? 1 : 0);

  /** One column: its head, the add box at the top of To do, and its cards. */
  function columnOf(column: (typeof columns)[number], at: number, shown: Record<string, TaskId[]>) {
    const drawn = shown[column.status]!.flatMap((id) => cards.get(id) ?? []);
    const side = isSide(column.status);
    return (
      <section
        key={column.status}
        // Every column takes an equal share of the width, down to the width
        // it always had. Past that the row scrolls sideways. Each rises in,
        // one after another.
        style={{ animationDelay: side ? undefined : `${at * 50}ms` }}
        className="flex min-w-72 flex-1 flex-col gap-3 px-4 pt-4 first:pl-0 last:pr-0 motion-safe:animate-rise-in"
      >
        <div className="flex items-baseline gap-3">
          <ColumnHead status={column.status} label={column.label} count={column.tasks.length} />
          {/* The sweep acts on the whole column, so it is column chrome. It
              sits with the name and the count, so the act on the column is
              where the column says what it holds. */}
          {isFinished(column.status) ? (
            <ColumnSweep
              label={column.label}
              cards={column.tasks.map((card) => ({ id: card.id, slug: org.slug }))}
              undoAt={`/o/${org.slug}/board`}
            />
          ) : null}
          {side ? <PutAway status={column.status as SideStatus} label={column.label} /> : null}
        </div>

        {/* The add box heads To do, where what it adds lands. It sits outside
            the keyed list, so a typed word is never a press the page reads.
            See ADR-0022. */}
        {column.status === "todo" ? <QuickAdd members={members} assignee={assignee} filters={filters} /> : null}

        {/* This is the keyed list: the cards and nothing else. It is as long
            as its cards, and the page scrolls, not the list. It fills the rest
            of a short column, so a drop below the last card still lands in
            it. See #193. */}
        <DropList
          id={column.status}
          ids={drawn.map((one) => one.id)}
          props={keyed(`${column.label} tasks`)}
          className="flex min-h-12 flex-1 flex-col gap-2 focus-visible:-outline-offset-2"
        >
          {/* The box files into To do, so an add in flight draws there. */}
          {column.status === "todo" ? <PendingAdds titles={addsSent(sent)} /> : null}
          {drawn.length === 0 && !(column.status === "todo" && addsSent(sent).length > 0) ? (
            <li
              aria-hidden="true"
              className="pointer-events-none rounded border border-dashed border-border p-3 text-center text-xs text-dim motion-safe:animate-rise-in"
            >
              {EMPTY_LINE[column.status]}
            </li>
          ) : null}
          {drawn.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              selected={cursor === card.id}
              domId={`card-${card.id}`}
              place={() => setOn(card.id)}
              slug={org.slug}
              finished={column.status === "done" || column.status === "cancelled"}
              move={move}
              color={org.color}
            />
          ))}
        </DropList>
      </section>
    );
  }

  return (
    // The board takes the whole page: no bar over it, the filters in the
    // search panel, Backlog and Cancelled in the drawer. Room at the left for
    // the drawer's tabs and at the right for the search button.
    <main className="flex flex-1 flex-col pl-8 pr-4 sm:pr-16">
      <BoardFilters active={active} clear={`?assignee=${encodeURIComponent(loaderData.personId)}`}>
        {search ? (
          <FilterRow label="Search" icon={<Search className="size-3" />}>
            <SearchChip search={search} />
          </FilterRow>
        ) : null}
        {members.length > 0 ? (
          <FilterRow label="Who" icon={<Users className="size-3" />}>
            <AssigneeFilter assignee={assignee} members={members} personId={loaderData.personId} />
          </FilterRow>
        ) : null}
        {filters.map((filter) => (
          <FilterRow
            key={filter.key}
            label={filter.label}
            icon={filter.client ? <Folder className="size-3" /> : <Tag className="size-3" />}
          >
            <FieldFilterSelect filter={filter} />
          </FilterRow>
        ))}
        <FilterRow label="Narrow to" icon={<CalendarDay className="size-3" />}>
          <span className="flex flex-wrap gap-1">
            <TodayChip today={today} hasPlan={hasPlan} />
            <WeekChip week={week} hasSet={hasSet} />
          </span>
        </FilterRow>
      </BoardFilters>

      <BacklogTab open={open.includes("backlog")} count={loaderData.backlogCount} calls={loaderData.backlogByRule} />
      <CancelledTab open={open.includes("cancelled")} count={loaderData.cancelledCount} />

      <DragLists
        lists={Object.fromEntries(columns.map((column) => [column.status, column.tasks.map((one) => one.id)]))}
        onDrop={onDrop}
        overlay={(id) => <DragCopy title={cards.get(id)?.title ?? ""} />}
      >
        {(shown) => (
          <>
            <BacklogDrawer open={open.includes("backlog")}>
              {columns.filter((column) => column.status === "backlog").map((column, at) => columnOf(column, at, shown))}
            </BacklogDrawer>
            <CancelledSheet open={open.includes("cancelled")}>
              {columns.filter((column) => column.status === "cancelled").map((column, at) => columnOf(column, at, shown))}
            </CancelledSheet>
            {/* Each column is as long as its cards, and the page scrolls. The
                columns are panes: a divider splits them, and a card is the one
                thing on the board with an edge. See #184 and #191. */}
            <div ref={board} className="flex flex-1 divide-x divide-border overflow-x-auto">
              {columns.filter((column) => !isSide(column.status)).map((column, at) => columnOf(column, at, shown))}
            </div>
          </>
        )}
      </DragLists>

      <DecisionPrompt ask={ask} />
      {/* A task, or a page of the org, opened over this one. See ADR-0039. */}
      <ModalOutlet closeTo={closeTo} />
    </main>
  );
}
