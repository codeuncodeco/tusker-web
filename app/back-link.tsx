/**
 * The way off the task page: a link back to the list the task was opened
 * from, and `Esc` bound to the same place.
 *
 * `Enter` opens a task from four lists, so the keyboard needs a way out. The
 * key rides on the control, as it does on every keyed list, so the link says
 * which press does the same thing.
 */

import { useEffect } from "react";
import { Link, useNavigate } from "react-router";

import { keyMark } from "./key-hint";
import { isPagePress } from "./keys";

export function BackLink({ to }: { to: string }) {
  const navigate = useNavigate();
  const { keys, hint } = keyMark("Escape");

  // `isPagePress` keeps the press off a box and off a raised prompt, so Esc
  // leaves the description editor before it leaves the page, and the decision
  // prompt is skipped before it is.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || !isPagePress(event)) return;
      event.preventDefault();
      navigate(to);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [to, navigate]);

  return (
    <Link to={to} {...keys} className="self-start text-muted underline underline-offset-2">
      ← Back
      {hint}
    </Link>
  );
}
