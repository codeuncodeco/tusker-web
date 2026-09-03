/**
 * The way off the task page: a link back to the list the task was opened
 * from, and `Esc` bound to the same place.
 *
 * `Enter` opens a task from four keyed lists, so the keyboard needs a way out.
 * The key rides on the control, as it does on every keyed list, so the link
 * says which press does the same thing.
 *
 * The press is not in `app/key-map.ts`. That map holds the acts a keyed list
 * binds, and the task page is not a list. One constant holds it here instead,
 * so the hint and the handler cannot say different keys.
 */

import { useEffect } from "react";
import { Link, useNavigate } from "react-router";

import { keyMark } from "./key-hint";
import { isPagePress } from "./keys";

/** The press that leaves the page, drawn on the link and bound to the window. */
const LEAVE = "Escape";

export function BackLink({ to }: { to: string }) {
  const navigate = useNavigate();
  const { keys, hint } = keyMark(LEAVE);

  // `isPagePress` keeps the press off a box and off a raised prompt, so Esc
  // leaves the description editor before it leaves the page, and the decision
  // prompt is skipped before it is.
  //
  // It replaces rather than pushes: opening a task and leaving it again must
  // not build a stack that browser Back walks into the task once more.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== LEAVE || !isPagePress(event)) return;
      event.preventDefault();
      navigate(to, { replace: true });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [to, navigate]);

  return (
    <Link to={to} replace {...keys} className="self-start text-muted underline underline-offset-2">
      ← Back
      {hint}
    </Link>
  );
}
