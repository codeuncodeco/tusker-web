/**
 * What the browser adds to a cross-org list: the day it is in, and the keys.
 *
 * The unified view and plan mode are one list, so they take one set of keys.
 * A key posts the fields the row's own buttons carry, so a key and a click
 * send one thing.
 */

import { useEffect } from "react";
import { useNavigate, useRevalidator } from "react-router";

import { DAY_COOKIE, localDay } from "./day";
import type { LiveTask } from "./unified";
import { finishFields, planFields } from "./unified-row";

/**
 * Tells the server which day the person is in. The Worker runs in UTC, so an
 * evening east of UTC reads the wrong plan until the browser says the day.
 * The cookie is written once, and the page then asks again.
 *
 * A page that names its own day says nothing, because the person asked for
 * that day and not for this one.
 */
export function useLocalDay(day: string, ask = true) {
  const revalidator = useRevalidator();

  useEffect(() => {
    if (!ask) return;
    const here = localDay();
    if (here === day) return;
    document.cookie = `${DAY_COOKIE}=${here}; path=/; max-age=86400; samesite=lax`;
    revalidator.revalidate();
  }, [ask, day, revalidator]);
}

/**
 * The keys a cross-org list binds: `j` and `k` move, `Enter` opens, `p` plans
 * and `x` finishes.
 *
 * The cursor names a task, not a place in the list. A plan moves a row into
 * Today, and the cursor goes with it.
 */
export function useUnifiedKeys(
  rows: LiveTask[],
  planned: Set<string>,
  on: string | null,
  setOn: (id: string) => void,
  act: (fields: Record<string, string>) => void,
) {
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // A person who types in a box wants the letter, not the key.
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const at = rows.findIndex((one) => one.id === on);
      const task = rows[at];
      if (event.key === "j") setOn(rows[Math.min(at + 1, rows.length - 1)]?.id ?? "");
      else if (event.key === "k") setOn(rows[Math.max(at - 1, 0)]?.id ?? "");
      else if (!task) return;
      else if (event.key === "Enter") navigate(`/o/${task.org.slug}/t/${task.id}`);
      else if (event.key === "p") act(planFields(task, planned.has(task.id)));
      // A task already finished has nothing left to finish.
      else if (event.key === "x") {
        if (task.finished) return;
        act(finishFields(task));
      } else return;

      event.preventDefault();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, planned, on, setOn, act, navigate]);
}
