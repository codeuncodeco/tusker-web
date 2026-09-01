/**
 * The quick-add box: the control that makes a task from a typed title.
 *
 * One box, two placements. On a board it sits at the top of a column, and the
 * column names the status. On the cross-org pages it carries an org picker.
 * The body here holds what both have — the title, the mark, the submit and the
 * error — and each page adds what only it has.
 *
 * The body is controlled. The cross-org box must be, because an undo gives the
 * words back, and one state model beats two that read the same on screen.
 */

import type { ReactNode, RefObject } from "react";
import type { FetcherWithComponents } from "react-router";

import { fieldClass } from "./forms";

/** The form a fetcher draws. It is the same shape whatever the fetcher answers. */
type FetcherForm = FetcherWithComponents<unknown>["Form"];

export function QuickAddBox({
  form: Form,
  label,
  title,
  onTitle,
  decides,
  onDecides,
  error,
  titleRef,
  onKeyDown,
  above,
  beside,
}: {
  /** The `Form` of the fetcher that posts the add. */
  form: FetcherForm;
  /** What the empty box says, and what a screen reader reads. */
  label: string;
  title: string;
  onTitle: (title: string) => void;
  decides: boolean;
  onDecides: (decides: boolean) => void;
  /** The sentence the act answered with, or nothing. */
  error?: string | null;
  titleRef?: RefObject<HTMLInputElement | null>;
  onKeyDown?: (event: React.KeyboardEvent<HTMLFormElement>) => void;
  /** What the page draws over the title row: its hidden fields, and any chip. */
  above?: ReactNode;
  /** What the page draws beside the title, such as an org picker. */
  beside?: ReactNode;
}) {
  return (
    <Form method="post" className="flex flex-col gap-2" onKeyDown={onKeyDown}>
      <input type="hidden" name="intent" value="create" />
      {above}

      <div className="flex flex-wrap gap-2">
        <input
          ref={titleRef}
          name="title"
          required
          value={title}
          onChange={(event) => onTitle(event.target.value)}
          placeholder={label}
          aria-label={label}
          className={`grow ${fieldClass}`}
        />
        {beside}
      </div>

      {/* Off by default. Most tasks decide nothing, and a prompt people
          learn to dismiss is how a log goes empty. See ADR-0010. */}
      <label className="flex items-center gap-2 text-xs text-neutral-500">
        <input
          type="checkbox"
          name="decides"
          value="1"
          checked={decides}
          onChange={(event) => onDecides(event.target.checked)}
        />
        Holds a decision
      </label>

      <button className="sr-only">Add</button>

      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </Form>
  );
}
