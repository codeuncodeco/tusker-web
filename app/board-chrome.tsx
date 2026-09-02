/**
 * The controls a board carries in its header: the search box, the Today chip
 * and the links that turn a hidden column on.
 *
 * The org board and the unified board draw the same five columns, so they draw
 * the same switches over them. Which columns each offers is the board's own
 * business, and so is which controls it draws: the search box is the org
 * board's alone, because a search is one org's rows.
 */

import { useEffect, useState } from "react";
import { Form, Link, useSearchParams } from "react-router";

import { flipped, STATUS_LABEL, type Status, type Toggles } from "./board";
import { fieldClass } from "./forms";
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
  const [params] = useSearchParams();

  return (
    <Link
      to={hasPlan ? flipped(params, "today", today) : "/me/plan"}
      // With no plan the chip is a way to plan mode and not a filter, so it
      // announces no pressed state it does not hold.
      aria-pressed={hasPlan ? today : undefined}
      className={`rounded-full border px-2 py-0.5 text-xs ${
        today
          ? "border-fg bg-fg text-bg"
          : "border-border"
      }`}
    >
      Today
    </Link>
  );
}

/** The link that turns one hidden column on or off, keeping the others. */
export function Toggle({ which, toggles }: { which: Status; toggles: Toggles }) {
  const [params] = useSearchParams();
  const on = toggles[which] ?? false;

  return (
    <Link to={flipped(params, which, on)} className="underline">
      {on ? "Hide" : "Show"} {STATUS_LABEL[which]}
    </Link>
  );
}
