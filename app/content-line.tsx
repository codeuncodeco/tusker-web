import { Dot } from "./dot";
import { OrgChip } from "./org-chip";
import type { LiveTask } from "./unified";

/**
 * The one line under a task's title, on a unified card and a unified row: the
 * org chip, the org's `show_on_card` fields joined by `·`, and the due date
 * rightmost. The two draw it from here, so they cannot drift apart.
 *
 * The field strip truncates before the due date does: the due date is the one
 * signal that reads the same in every org. A part with nothing to show draws
 * nothing, and the line collapses once no part is left. The chip is left off
 * for a person in one org, because there is no other org to tell it from.
 */
export function ContentLine({ task, named = true }: { task: LiveTask; named?: boolean }) {
  return (
    <span className="flex items-center gap-2 text-xs text-muted empty:hidden">
      {named ? <OrgChip org={task.org} /> : null}
      {task.fields.length > 0 ? (
        <span className="flex min-w-0 flex-1 gap-1 truncate">
          {task.fields.map((field, at) => (
            <span key={field.key} className="flex items-center gap-1 truncate">
              {at > 0 ? <span aria-hidden="true">·</span> : null}
              <Dot color={field.color} />
              {field.value}
            </span>
          ))}
        </span>
      ) : null}
      {task.due_date ? <span className="ml-auto shrink-0 tabular-nums">{task.due_date}</span> : null}
    </span>
  );
}
