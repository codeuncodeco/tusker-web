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
 */

import { usePost } from "./pending";
import { SavedInput } from "./saved-input";
import { TASK_FORM } from "./task-aside";

export function TaskTitle({ title, finished }: { title: string; finished: boolean }) {
  const post = usePost(true);

  if (finished) return <h1 className="text-2xl tracking-tight">{title}</h1>;

  return (
    <h1 className="text-2xl tracking-tight">
      <SavedInput
        name="title"
        form={TASK_FORM}
        aria-label="Title"
        required
        value={title}
        onSave={(value) => post({ intent: "title", title: value })}
        className="-mx-2 w-[calc(100%+1rem)] rounded border border-transparent bg-transparent px-2 py-1 hover:border-border focus:border-border"
      />
    </h1>
  );
}
