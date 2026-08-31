import { useEffect } from "react";
import { Link, useFetcher, useLocation, useNavigate } from "react-router";

import type { Ask } from "./decisions.server";
import { withoutPrompt } from "./decisions";
import { fieldClass } from "./forms";

/**
 * The prompt a finished task raises: a title, and the reasoning while it is
 * still in the person's head.
 *
 * Esc skips it, and the task is Done all the same. A skip writes nothing,
 * because the move that finished the task already recorded the ask. See
 * ADR-0009.
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
        className="flex w-full max-w-lg flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <h2 id="decision-prompt" className="text-lg font-semibold tracking-tight">
          What was decided?
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {ask.title} is Done. Press <kbd>Esc</kbd> to skip.
        </p>

        <post.Form method="post" className="flex flex-col gap-3">
          <input type="hidden" name="intent" value="decide" />
          <input type="hidden" name="id" value={ask.id} />
          <input type="hidden" name="slug" value={ask.slug} />

          <label className="flex flex-col gap-1 text-sm">
            Title
            <input
              name="title"
              required
              autoFocus
              defaultValue={ask.title}
              className={fieldClass}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Rationale
            <textarea name="rationale" rows={4} className={fieldClass} />
          </label>

          {error ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          ) : null}

          <div className="flex items-baseline gap-4">
            <button className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700">
              Keep it
            </button>
            <Link to={closed} replace className="text-sm underline">
              Skip
            </Link>
          </div>
        </post.Form>
      </div>
    </div>
  );
}
