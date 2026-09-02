/**
 * The controls a board carries in its header: the search box, the Today and
 * Week chips and the switches that draw a hidden column.
 *
 * The org board and the unified board draw the same five columns, so they draw
 * the same switches over them. Which columns each offers is the board's own
 * business, and so is which controls it draws: the search box is the org
 * board's alone, because a search is one org's rows.
 */

import { useEffect, useState } from "react";
import { Form, Link, useSearchParams } from "react-router";

import {
  flipped,
  narrowedTo,
  STATUS_LABEL,
  type Narrowing,
  type Status,
  type Toggles,
} from "./board";
import { fieldClass } from "./forms";
import { Square, SquareCheck } from "./icons";
import { SEARCH_NAME, withoutSearch } from "./search";

/**
 * The box that narrows a board to the tasks holding the text.
 *
 * It is a GET form, so a search is a place: the address carries it, Back works
 * and a narrowed board is a link. The rest of the query rides along as hidden
 * fields, so a search keeps the columns a person turned on.
 */
export function SearchBox({ search }: { search: string }) {
  const [params] = useSearchParams();
  // The box is the person's while they type, and the address is the truth
  // after they submit or move.
  const [text, setText] = useState(search);
  useEffect(() => setText(search), [search]);

  return (
    <Form method="get" role="search" className="flex items-baseline gap-2">
      {withoutSearch(params).map(([name, value], at) => (
        <input key={`${name}:${at}`} type="hidden" name={name} value={value} />
      ))}
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
      className={`rounded-full border px-2 py-0.5 text-xs ${
        on ? "border-fg bg-fg text-bg" : "border-border"
      }`}
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
      className="inline-flex items-baseline gap-1.5 text-xs uppercase tracking-wide"
    >
      {on ? <SquareCheck /> : <Square />}
      {label}
    </Link>
  );
}
