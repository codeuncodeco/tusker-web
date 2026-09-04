/**
 * The quick-add box: the control that makes a task from a typed title.
 *
 * One box, two placements. On a board it sits at the top of a column, and the
 * column names the status. On the cross-org pages it carries an org picker.
 * The body here holds what both have — the title, the mark, the submit and the
 * error — and each page adds what only it has.
 *
 * The body is controlled. The cross-org box must be, because an undo gives the
 * words back, and one state model is better than two that read the same on screen.
 *
 * The title is a textarea one line high, not an input. An input strips the line
 * breaks out of a paste before the form is posted, and the line breaks are what
 * makes a pasted list several tasks. Enter still posts, and Shift+Enter makes a
 * line, so a person who types one title sees no change.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { FetcherWithComponents } from "react-router";

import { useSurface } from "./keyed-list";

/**
 * `n` focuses one box, so a page keyed for the board still adds a task without
 * the pointer. A page with several boxes gives the key to one of them, because
 * one key names one box: on a board that is the To do column.
 *
 * The press is the keyed list's, not the window's: `n` on a window is live on
 * the whole page, and a speech-input user's next sentence lands in a task
 * title. So the box says it is this surface's, and the list moves the focus to
 * it while the list holds the focus. See ADR-0022.
 */
export function useAddKey(box: RefObject<HTMLTextAreaElement | null>, bound: boolean) {
  const surface = useSurface();

  useEffect(() => {
    if (!bound) return;
    surface.box.current = box;
    return () => {
      if (surface.box.current === box) surface.box.current = null;
    };
  }, [box, bound, surface]);
}

/** The form a fetcher draws. It is the same shape whatever the fetcher answers. */
type FetcherForm = FetcherWithComponents<unknown>["Form"];

/** The values the box holds while a person types, and the way to empty it. */
export type Draft = {
  title: string;
  setTitle: (title: string) => void;
  decides: boolean;
  setDecides: (decides: boolean) => void;
  /** The members every task of the next add is held by. */
  assignees: string[];
  setAssignees: (ids: string[]) => void;
  /** What an add empties: the words and the mark, and not the members. */
  clear: () => void;
};

/**
 * The words, the mark and the picked members, held for as long as the box is
 * on screen.
 *
 * An add empties the words and the mark. It leaves the members: a person
 * filing three tasks to one member names them once, as they name the org once.
 */
export function useQuickAddDraft(): Draft {
  const [title, setTitle] = useState("");
  const [decides, setDecides] = useState(false);
  const [assignees, setAssignees] = useState<string[]>([]);
  // Stable, so an effect that empties the box on an add runs once.
  const clear = useCallback(() => {
    setTitle("");
    setDecides(false);
  }, []);
  return { title, setTitle, decides, setDecides, assignees, setAssignees, clear };
}

export function QuickAddBox({
  form: Form,
  label,
  draft,
  error,
  titleRef,
  onKeyDown,
  fields,
  chip,
  picker,
}: {
  /** The `Form` of the fetcher that posts the add. */
  form: FetcherForm;
  /** What the empty box says, and what a screen reader reads. */
  label: string;
  draft: Draft;
  /** The sentence the act answered with, or nothing. */
  error?: string | null;
  titleRef?: RefObject<HTMLTextAreaElement | null>;
  onKeyDown?: (event: React.KeyboardEvent<HTMLFormElement>) => void;
  /** The hidden fields that name the target: a status, or an org. */
  fields?: ReactNode;
  /** The line over the box that names where the task lands. */
  chip?: ReactNode;
  /**
   * The controls beside the title: the org a cross-org box files into, and the
   * members who hold what it makes.
   */
  picker?: ReactNode;
}) {
  const box = useRef<HTMLTextAreaElement>(null);

  // The box starts one line high and grows with what it holds, up to a few
  // lines, so a person sees the list they pasted before they post it.
  useEffect(() => {
    const field = box.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [draft.title]);

  return (
    // The box reads as one card and not as three stacked boxes, so the form
    // carries the chrome a card carries. Focus shows on the card, in the
    // border a selected card takes: the fill and the focus stay two signals.
    <Form
      method="post"
      className="flex flex-col gap-2 rounded border border-border bg-surface p-3 focus-within:border-fg"
      onKeyDown={onKeyDown}
    >
      <input type="hidden" name="intent" value="create" />
      {fields}
      {chip}

      <textarea
        ref={(field) => {
          box.current = field;
          if (titleRef) titleRef.current = field;
        }}
        name="title"
        required
        rows={1}
        value={draft.title}
        onChange={(event) => draft.setTitle(event.target.value)}
        onKeyDown={(event) => {
          // Enter posts, as it did while this was an input. Shift+Enter
          // makes a line, and a paste brings its own. A key pressed while an
          // input method is composing belongs to that method.
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }}
        placeholder={label}
        aria-label={label}
        // No border and no rectangle of its own: the fill alone says where
        // the words go, and it reads as a well inside the card.
        className="resize-none overflow-y-auto max-h-40 rounded bg-surface-2 px-3 py-2"
      />

      {/* The picker and the decision box share one line, and wrap when the
          card is too narrow to hold both. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {picker}

        {/* Off by default. Most tasks decide nothing, and a prompt people
            learn to dismiss is how a log goes empty. See ADR-0010. */}
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            name="decides"
            value="1"
            checked={draft.decides}
            onChange={(event) => draft.setDecides(event.target.checked)}
          />
          Holds a decision
        </label>
      </div>

      <button className="sr-only">Add</button>

      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
    </Form>
  );
}
