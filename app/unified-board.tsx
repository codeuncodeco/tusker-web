/**
 * The unified board: one person's tasks across every org they belong to, in
 * the five columns the org board draws.
 *
 * A person who learns the board on one org meets the same page on all of them.
 * The layout is the org board's; the order is the unified sort, and it is
 * derived: no card is dragged and no card steps. See ADR-0006, "One order per
 * column".
 */

import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";

import { flipped, STATUS_LABEL } from "./board";
import type { OrgHeld } from "./current-org";
import { useLocalDay } from "./local-day";
import type { Column, UnifiedToggle, UnifiedToggles } from "./unified";
import { UnifiedAdd } from "./unified-add";
import { UnifiedCard } from "./unified-card";
import { useTaskKeys } from "./unified-keys";

export function UnifiedBoard({
  columns,
  orgs,
  planned,
  day,
}: {
  columns: Column[];
  /** Every org the person belongs to, for the org picker on every box. */
  orgs: OrgHeld[];
  /** The task ids the day's plan holds, which turn Plan into Unplan. */
  planned: Set<string>;
  day: string;
}) {
  const post = useFetcher();
  const [on, setOn] = useState<string | null>(null);
  const board = useRef<HTMLDivElement>(null);

  // One flat order, so `j` and `k` walk the board column by column, the way a
  // person reads it.
  const rows = columns.flatMap((column) => column.tasks);
  // The cursor starts at the top, and stays on its task while the board moves.
  const cursor = rows.some((one) => one.id === on) ? on : (rows[0]?.id ?? null);

  // The chip speaks for today, so the board must know which day that is where
  // the person is, not where the Worker runs.
  useLocalDay(day);
  useTaskKeys(rows, planned, false, cursor, setOn, (fields) =>
    post.submit(fields, { method: "post" }),
  );

  // The cursor follows the keys down a column longer than the window.
  useEffect(() => {
    board.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div ref={board} className="flex flex-1 gap-4 overflow-x-auto">
      {columns.map((column) => (
        <section
          key={column.status}
          className="flex w-72 shrink-0 flex-col gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
        >
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            {column.label} <span className="text-neutral-400">{column.tasks.length}</span>
          </h2>

          {/* One box per column, and the column names the status. The picker
              starts at the personal org every time. See ADR-0012. */}
          <UnifiedAdd
            orgs={orgs}
            status={column.status}
            label={`Add to ${column.label}`}
            // One key names one box, and To do is where an add goes by hand.
            hotkey={column.status === "todo"}
          />

          <ul className="flex flex-col gap-2">
            {column.tasks.map((task, at) => (
              <UnifiedCard
                key={task.id}
                task={task}
                rank={at + 1}
                planned={planned.has(task.id)}
                selected={cursor === task.id}
                domId={`card-${task.id}`}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * The chip that narrows the board to today's plan, and gives it back.
 *
 * A person with no plan for today gets no chip: there is nothing to narrow to,
 * and the header already carries Plan on every page.
 */
export function TodayChip({ today }: { today: boolean }) {
  const [params] = useSearchParams();

  return (
    <Link
      to={flipped(params, "today", today)}
      aria-pressed={today}
      className={`rounded-full border px-2 py-0.5 text-xs ${
        today
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-200 dark:bg-neutral-200 dark:text-neutral-900"
          : "border-neutral-300 dark:border-neutral-700"
      }`}
    >
      Today
    </Link>
  );
}

/** The link that turns one hidden column on or off, keeping the others. */
export function Toggle({ which, toggles }: { which: UnifiedToggle; toggles: UnifiedToggles }) {
  const [params] = useSearchParams();

  return (
    <Link to={flipped(params, which, toggles[which])} className="underline">
      {toggles[which] ? "Hide" : "Show"} {STATUS_LABEL[which]}
    </Link>
  );
}
