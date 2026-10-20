/**
 * The controls a board carries in its header: the search box, the Today and
 * Week chips and the switches that draw a hidden column.
 *
 * The org board and the unified board draw the same five columns, so they draw
 * the same switches over them. Which columns each offers is the board's own
 * business, and so is which controls it draws: the search box and the field
 * filters are the org board's alone, because a search is one org's rows and
 * each org declares its own fields. Both boards draw an assignee filter, but
 * the unified board's names no member, because a member list across every
 * org would name strangers. See ADR-0017, ADR-0029 and ADR-0033.
 *
 * Every filter is a row of chips, and one click narrows: nothing opens first.
 * See ADR-0035.
 */

import { useEffect, useState } from "react";
import { Form, Link, useSearchParams } from "react-router";

import { addressed, ANYONE, ASSIGNEE_NAME, MINE, UNASSIGNED } from "./assignee-filter";
import type { Assignee } from "./assignees";
import {
  flipped,
  narrowedTo,
  STATUS_LABEL,
  type Narrowing,
  type Status,
  type Toggles,
} from "./board";
import { CLIENT_NAME, clientValue, sameClient, type ClientChoice, type ClientPick } from "./client-filter";
import { Dot } from "./dot";
import { fieldName, type FieldFilter } from "./field-filter";
import { fieldClass, smallFieldClass } from "./forms";
import { AnglesLeft, Circle, CircleCheck, CircleHalf, CircleXMark, Inbox, Square, SquareCheck } from "./icons";
import { Avatar } from "./initials";
import { orgInitialsOf } from "./org-chip";
import { without } from "./query";
import { SEARCH_NAME } from "./search";

/**
 * The rest of the address, as hidden fields, for a GET form that owns one name
 * of it.
 *
 * Each narrowing is its own form, and each carries the whole of the other's
 * address, so a search keeps the filter and the columns a person turned on,
 * and a filter keeps the search.
 */
function RestOfQuery({ except }: { except: string }) {
  const [params] = useSearchParams();

  return (
    <>
      {without(params, except).map(([name, value], at) => (
        <input key={`${name}:${at}`} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

/**
 * The box that narrows a board to the tasks holding the text.
 *
 * It is a GET form, so a search is a place: the address carries it, Back works
 * and a narrowed board is a link. The rest of the query rides along as hidden
 * fields, so a search keeps the columns a person turned on.
 */
export function SearchBox({ search }: { search: string }) {
  // The box is the person's while they type, and the address is the truth
  // after they submit or move.
  const [text, setText] = useState(search);
  useEffect(() => setText(search), [search]);

  return (
    <Form method="get" role="search" className="flex items-baseline gap-2">
      <RestOfQuery except={SEARCH_NAME} />
      <input
        type="search"
        name={SEARCH_NAME}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        aria-label="Search tasks"
        placeholder="Search"
        className={`w-48 ${fieldClass}`}
      />
      {/* Enter in the box submits. This is the press for everybody else. */}
      <button className="sr-only">Search</button>
    </Form>
  );
}

/**
 * The words an org board is narrowed to, as a chip: one click clears them.
 * The global search sets them, from "Narrow this board to". See ADR-0038.
 */
export function SearchChip({ search }: { search: string }) {
  const [params] = useSearchParams();
  return (
    <Link
      to={`?${new URLSearchParams(without(params, SEARCH_NAME))}`}
      preventScrollReset
      aria-label={`Clear the search for ${search}`}
      className={`${chipClass(true)} self-start`}
    >
      “{search}”<span aria-hidden="true">✕</span>
    </Link>
  );
}

/**
 * The address with one name set to one value, and the rest of it kept, so a
 * chip keeps the search, the other filters and the columns a person turned on.
 */
function withValue(params: URLSearchParams, name: string, value: string): string {
  const next = new URLSearchParams(without(params, name));
  next.set(name, value);
  return `?${next}`;
}

/** The look of a filter chip, pressed or not. A chip that turns on pops. */
export function chipClass(on: boolean): string {
  return `press inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs ${
    on
      ? "border-fg bg-fg text-bg motion-safe:animate-pop"
      : "border-border text-muted hover:border-dim hover:bg-surface-2 hover:text-fg"
  }`;
}

/**
 * One chip of a filter: a link that sets one value of the address. It is a
 * link and not a form, so a filter is a place, Back works, and no script is
 * needed. The page keeps its scroll.
 */
function FilterChip({
  to,
  on,
  label,
  className,
  children,
}: {
  to: string;
  on: boolean;
  /** What a screen reader hears, where the chip draws a picture. */
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-pressed={on}
      aria-label={label}
      title={label}
      preventScrollReset
      className={className ?? chipClass(on)}
    >
      {children}
    </Link>
  );
}

/** A row of chips that are one filter, read as one group. */
function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      {children}
    </div>
  );
}

/**
 * The chips that narrow an org board to the tasks one member holds, or to the
 * tasks nobody holds: the reader first, then `Anyone` and `Unassigned`, then
 * every other member as an avatar. One click narrows; nothing opens.
 *
 * A bare address is the reader's own work, so their chip is the start. See
 * ADR-0035. A board that draws no assignee draws no chips, and says so by
 * handing back no members.
 */
export function AssigneeFilter({
  assignee,
  members,
  personId,
}: {
  assignee: string;
  members: Assignee[];
  personId: string;
}) {
  const [params] = useSearchParams();
  if (members.length === 0) return null;
  const to = (value: string) => withValue(params, ASSIGNEE_NAME, addressed(value));
  const me = members.find((one) => one.id === personId);
  const others = members.filter((one) => one.id !== personId);

  return (
    <ChipGroup label="Filter by assignee">
      {me ? (
        <FilterChip to={to(me.id)} on={assignee === me.id} label={`Mine: tasks ${me.name} holds`}>
          <Avatar person={me} className="-ml-1.5 size-4 text-[0.5rem]" />
          Mine
        </FilterChip>
      ) : null}
      <FilterChip to={to(ANYONE)} on={assignee === ANYONE}>
        Anyone
      </FilterChip>
      <FilterChip to={to(UNASSIGNED)} on={assignee === UNASSIGNED}>
        Unassigned
      </FilterChip>
      {others.map((one) => {
        const on = assignee === one.id;
        return (
          <FilterChip
            key={one.id}
            to={to(one.id)}
            on={on}
            label={`Tasks ${one.name} holds`}
            className={`press flex rounded-full ${on ? "ring-2 ring-fg ring-offset-1 ring-offset-bg motion-safe:animate-pop" : "opacity-60 hover:opacity-100"}`}
          >
            <Avatar person={one} size="md" />
          </FilterChip>
        );
      })}
    </ChipGroup>
  );
}

/**
 * The unified board's chips: `Mine`, `Anyone` and `Unassigned`. They name no
 * member, because the board spans orgs and a member list across them names
 * strangers. `Mine` is a word in the address, so a shared link shows whoever
 * opens it their own work, and a bare address is `Mine`. See ADR-0033 and
 * ADR-0035.
 */
export function UnifiedAssigneeFilter({ assignee }: { assignee: string }) {
  const [params] = useSearchParams();
  const to = (value: string) => withValue(params, ASSIGNEE_NAME, addressed(value));

  return (
    <ChipGroup label="Filter by assignee">
      <FilterChip to={to(MINE)} on={assignee === MINE}>
        Mine
      </FilterChip>
      <FilterChip to={to(ANYONE)} on={assignee === ANYONE}>
        Anyone
      </FilterChip>
      <FilterChip to={to(UNASSIGNED)} on={assignee === UNASSIGNED}>
        Unassigned
      </FilterChip>
    </ChipGroup>
  );
}

/**
 * The unified board's client chips: `Every client`, then each client of each
 * org that names a client field, with its option colour and its org's dot
 * where the person holds more than one such org. One click narrows the board
 * to that client's tasks; a click on the chip held gives the board back. An
 * org set with no client field draws nothing. See ADR-0036.
 */
export function UnifiedClientFilter({
  clients,
  client,
}: {
  clients: ClientChoice[];
  client: ClientPick | null;
}) {
  const [params] = useSearchParams();
  if (clients.length === 0) return null;
  const every = `?${new URLSearchParams(without(params, CLIENT_NAME))}`;
  const orgs = new Set(clients.map((one) => one.slug));

  return (
    <ChipGroup label="Filter by client">
      <FilterChip to={every} on={client === null}>
        Every client
      </FilterChip>
      {clients.map((one) => {
        const on = sameClient(client, one);
        return (
          <FilterChip
            key={`${one.slug}:${one.value}`}
            to={on ? every : withValue(params, CLIENT_NAME, clientValue(one))}
            on={on}
            label={orgs.size > 1 ? `${one.label}, ${one.org.name}` : undefined}
          >
            <Dot color={one.color} />
            {one.label}
            {orgs.size > 1 ? <span className="text-dim">{orgInitialsOf(one.org.name)}</span> : null}
          </FilterChip>
        );
      })}
    </ChipGroup>
  );
}

/**
 * The most values a field filter draws as chips. A longer list would fill the
 * row, so it draws the select instead.
 */
export const CHIP_LIMIT = 8;

/**
 * The filter that narrows the board to the tasks holding one value of one
 * field: `Any`, then the values the field offers, each a chip with its option
 * colour. A field with more values than `CHIP_LIMIT` draws a select instead.
 *
 * Either way it rides the address under the name the task API reads,
 * `field.<key>`, and keeps the rest of the address, so picking a value keeps
 * the search, the member and every other field filter. A click on the value
 * already held gives the board back to `Any`.
 */
export function FieldFilterSelect({ filter }: { filter: FieldFilter }) {
  const name = fieldName(filter.key);
  const [params] = useSearchParams();

  if (filter.options.length <= CHIP_LIMIT) {
    const any = `?${new URLSearchParams(without(params, name))}`;
    return (
      <ChipGroup label={`Filter by ${filter.label}`}>
        <FilterChip to={any} on={filter.value === ""}>
          Any {filter.label.toLowerCase()}
        </FilterChip>
        {filter.options.map((one) => {
          const on = filter.value === one.value;
          return (
            <FilterChip key={one.value} to={on ? any : withValue(params, name, one.value)} on={on}>
              {filter.client ? <Dot color={one.color ?? null} /> : null}
              {one.label}
            </FilterChip>
          );
        })}
      </ChipGroup>
    );
  }

  return (
    <Form method="get" className="flex items-baseline">
      <RestOfQuery except={name} />
      <select
        name={name}
        aria-label={`Filter by ${filter.label}`}
        value={filter.value}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className={smallFieldClass}
      >
        <option value="">Any {filter.label.toLowerCase()}</option>
        {filter.options.map((one) => (
          <option key={one.value} value={one.value}>
            {one.label}
          </option>
        ))}
      </select>
      {/* The submit the select needs when no script runs. */}
      <button className="sr-only">Filter</button>
    </Form>
  );
}

/**
 * The chip that narrows a board to today's plan, and gives it back.
 *
 * A day with no plan holds nothing to narrow to, so the chip then leads to
 * plan mode: a control that comes and goes teaches nobody that plans exist.
 * A board that would rather draw no chip at all leaves this out.
 */
export function TodayChip({ today, hasPlan }: { today: boolean; hasPlan: boolean }) {
  return <Chip label="Today" which="today" on={today} narrows={hasPlan} away="/me/plan" />;
}

/**
 * The chip that narrows a board to this week's set, and gives it back.
 *
 * It sits beside the Today chip and reads the same way. A week with no set
 * holds nothing to narrow to, so the chip then leads to the week page.
 * See ADR-0014.
 */
export function WeekChip({ week, hasSet }: { week: boolean; hasSet: boolean }) {
  return <Chip label="Week" which="week" on={week} narrows={hasSet} away="/me/week" />;
}

/**
 * One narrowing chip.
 *
 * The two narrowings are exclusive, so pressing one drops the other: a board
 * is narrowed by Today, by Week, or by neither. The narrowing lives in the
 * address, so a narrowed board is a link and Back works.
 */
function Chip({
  label,
  which,
  on,
  narrows,
  away,
}: {
  label: string;
  which: Narrowing;
  on: boolean;
  /** True where the chip has something to narrow to. */
  narrows: boolean;
  /** Where the chip leads while it narrows nothing. */
  away: string;
}) {
  const [params] = useSearchParams();

  return (
    <Link
      to={narrows ? narrowedTo(params, which, on) : away}
      // With nothing to narrow to the chip is a way to a page and not a
      // filter, so it announces no pressed state it does not hold.
      aria-pressed={narrows ? on : undefined}
      className={chipClass(on)}
    >
      {label}
    </Link>
  );
}

/**
 * The column switch: a box that says whether one hidden column is drawn.
 *
 * It stays a link that flips a query parameter, so the address holds the
 * board: no form, no script, no client state. The label is the column and
 * holds no verb, because the box already says what the click does, so the link
 * names the act to a screen reader instead.
 */
export function ColumnSwitch({ which, toggles }: { which: Status; toggles: Toggles }) {
  const [params] = useSearchParams();
  const on = toggles[which] ?? false;
  const label = STATUS_LABEL[which];

  return (
    <Link
      to={flipped(params, which, on)}
      aria-label={`${on ? "Hide" : "Show"} ${label}`}
      preventScrollReset
      className="press inline-flex items-baseline gap-1.5 text-xs uppercase tracking-wide text-muted hover:text-fg"
    >
      <span key={on ? "on" : "off"} className="inline-flex self-center motion-safe:animate-pop">
        {on ? <SquareCheck /> : <Square />}
      </span>
      {label}
    </Link>
  );
}

/**
 * The glyph, colour and motion each column's head draws, so a column reads at
 * a glance before its name is read. The motion is slight and runs forever
 * only where it says something: work in progress turns, work to do waits.
 * Every motion stops for a person who asked for less.
 */
const COLUMN_LOOK: Record<Status, { icon: React.ReactNode; tone: string; motion: string }> = {
  backlog: { icon: <Inbox className="size-3.5" />, tone: "text-dim", motion: "" },
  todo: { icon: <Circle className="size-3.5" />, tone: "text-muted", motion: "motion-safe:animate-breathe" },
  in_progress: { icon: <CircleHalf className="size-3.5" />, tone: "text-fg", motion: "motion-safe:animate-drift" },
  done: { icon: <CircleCheck className="size-3.5" />, tone: "text-win", motion: "" },
  cancelled: { icon: <CircleXMark className="size-3.5" />, tone: "text-dim", motion: "" },
};

/**
 * The head of one column: its glyph, its name and its count. When the count
 * changes the count ticks and the glyph pops, so a card that lands is seen to
 * land. Backlog, when it is open by choice, carries the fold that closes it
 * back into its bar.
 */
export function ColumnHead({
  status,
  label,
  count,
  fold,
}: {
  status: Status;
  label: string;
  count: number;
  /** The address that folds the column away, or null where it cannot be folded. */
  fold?: string | null;
}) {
  const look = COLUMN_LOOK[status];

  return (
    <h2 className="flex items-center gap-2 font-mono uppercase tracking-wide text-muted">
      <span key={count} aria-hidden="true" className={`flex ${look.tone} motion-safe:animate-pop`}>
        <span className={`flex ${look.motion}`}>{look.icon}</span>
      </span>
      {label}
      {/* The key draws the count again when it changes, so it ticks. */}
      <span key={`n${count}`} className="inline-block text-dim tabular-nums motion-safe:animate-tick">
        {count}
      </span>
      {fold ? (
        <Link
          to={fold}
          preventScrollReset
          aria-label={`Fold ${label} away`}
          title={`Fold ${label} away`}
          className="press -my-1 ml-1 flex size-6 items-center justify-center rounded text-dim hover:bg-surface-2 hover:text-fg"
        >
          <AnglesLeft className="size-3" />
        </Link>
      ) : null}
    </h2>
  );
}
