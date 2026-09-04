import { useEffect, useRef } from "react";
import { Link, useFetcher, useLocation, useNavigate } from "react-router";

import { DecisionFields } from "./decision-fields";
import type { Ask } from "./decisions.server";
import { useKeyedFocus } from "./keyed-list";
import { withoutPrompt } from "./decisions";

/**
 * The prompt a finished task raises: a title, and the reasoning while it is
 * still in the person's head.
 *
 * Esc skips it, and the task is Done all the same. A skip writes nothing, and
 * nothing records that it happened: the prompt is raised again the next time
 * the task is finished, and the person unmarks the task to end it. See
 * ADR-0010.
 *
 * The form posts to the page it sits on, so one component serves the board,
 * the task page and both cross-org lists. With no script it is a plain form
 * and a Skip link.
 */
export function DecisionPrompt({ ask }: { ask: Ask | null }) {
  const post = useFetcher<{ error?: string }>();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const closed = withoutPrompt(pathname, search);
  const raised = ask !== null;
  const refocus = useKeyedFocus();

  // The prompt covers the list and takes the focus off it, and the keys are
  // live only where the focus is, so the prompt gives it back to the list it
  // came from. A person who finished a task by key keeps pressing keys.
  // See ADR-0022.
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !raised) refocus();
    was.current = raised;
  }, [raised, refocus]);

  // Esc skips, wherever the caret is: a person in the rationale box who wants
  // out means out.
  useEffect(() => {
    if (!raised) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      navigate(closed, { replace: true });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [raised, closed, navigate]);

  if (!ask) return null;
  const error = post.data?.error;

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="decision-prompt"
        className="flex w-full max-w-lg flex-col gap-3 rounded-lg border border-border bg-surface p-6"
      >
        <h2 id="decision-prompt" className="text-lg tracking-tight">
          What was decided?
        </h2>
        <p className="text-muted">
          {ask.title} is Done. Press <kbd>Esc</kbd> to skip.
        </p>

        <post.Form method="post" className="flex flex-col gap-3">
          <input type="hidden" name="intent" value="decide" />
          <input type="hidden" name="id" value={ask.id} />
          <input type="hidden" name="slug" value={ask.slug} />

          {/* The title starts empty, with the task named beside it. A title
              that repeats the task says nothing the log did not already
              hold. */}
          <DecisionFields first placeholder={`What ${ask.title} settled`} error={error} />

          <div className="flex items-baseline gap-4">
            <button className="rounded border border-border px-3 py-2">
              Keep it
            </button>
            <Link to={closed} replace className="underline">
              Skip
            </Link>
          </div>
        </post.Form>
      </div>
    </div>
  );
}
