/**
 * The title of a task, drawn once: as the page's heading, and as the box that
 * edits it. It reads as a heading and shows its border only under the pointer
 * or the caret.
 *
 * `Enter` or leaving the box saves it. `Esc` puts the saved title back and
 * leaves the box, and does not go back to the list. A title emptied and left
 * goes back to the saved one and posts nothing: a task needs a title, and the
 * server refuses an empty one too. See #204.
 *
 * A finished task is read, so its title is a plain heading. See #164.
 *
 * The task's number stands before the title, in both, as `#1234`: it is the
 * name a person says and types. See ADR-0030.
 */

import { useState } from "react";

import { usePost } from "./pending";
import { SavedInput } from "./saved-input";
import { TASK_FORM } from "./task-aside";
import { taskLabel, type TaskId } from "./task-number";

export function TaskTitle({
  id,
  title,
  finished,
  large = false,
}: {
  id: TaskId;
  title: string;
  finished: boolean;
  /** True on a task opened as a modal, where the title heads the sheet. */
  large?: boolean;
}) {
  const post = usePost({ flushSync: true });
  const [editing, setEditing] = useState(false);
  const label = <span className="shrink-0 font-mono text-dim">{taskLabel(id)}</span>;

  if (finished) {
    return (
      <h1 className={`flex items-baseline gap-3 tracking-tight ${large ? "text-3xl sm:text-4xl" : "text-2xl"}`}>
        {label}
        <span className="min-w-0">{title}</span>
      </h1>
    );
  }

  // A large title reads as text, wrapping, and a click turns it into the box
  // it is edited in, one click as the box was. See ADR-0039.
  if (large && !editing) {
    return (
      <h1 className="flex items-baseline gap-3 text-2xl tracking-tight sm:text-4xl">
        {label}
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Rename"
          className="-mx-2 min-w-0 flex-1 cursor-text rounded-lg px-2 py-1 text-left [overflow-wrap:anywhere] hover:bg-surface-2 noscript:hidden"
        >
          {title}
        </button>
        {/* With no script the title is a box of the page's one form. */}
        <noscript>
          <input name="title" form={TASK_FORM} aria-label="Title" required defaultValue={title} className="w-full bg-transparent" />
        </noscript>
      </h1>
    );
  }

  return (
    <h1 className={`flex items-baseline gap-3 tracking-tight ${large ? "text-2xl sm:text-4xl" : "text-2xl"}`}>
      {label}
      <SavedInput
        autoFocus={large}
        onBlur={() => setEditing(false)}
        name="title"
        form={TASK_FORM}
        aria-label="Title"
        required
        value={title}
        onSave={(value) => post({ intent: "title", title: value })}
        className="-mx-2 min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 hover:border-border focus:border-border"
      />
    </h1>
  );
}
