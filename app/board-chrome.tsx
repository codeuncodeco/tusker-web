/**
 * The controls both boards carry in their header: the Today chip and the
 * links that turn a hidden column on.
 *
 * The org board and the unified board draw the same five columns, so they draw
 * the same switches over them. Which columns each offers is the board's own
 * business; the switch is not.
 */

import { Link, useSearchParams } from "react-router";

import { flipped, STATUS_LABEL, type Status, type Toggles } from "./board";

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
