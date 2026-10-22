import { ClientTag } from "./client-tag";
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
 * for a person in one org, because there is no other org to tell it from. See
 * `tellsOrgsApart`.
 */
export function ContentLine({ task, showsOrg }: { task: LiveTask; showsOrg: boolean }) {
  return (
    <span className="flex items-center gap-2 text-xs text-muted empty:hidden">
      {showsOrg ? <OrgChip org={task.org} /> : null}
      {task.fields.length > 0 ? (
        <span className="flex min-w-0 flex-1 gap-1 truncate">
          {task.fields.map((field, at) =>
            // The client is a tag of its own, first. See ADR-0036.
            field.client ? (
              <ClientTag key={field.key} label={field.value} color={field.color} />
            ) : (
              <span key={field.key} className="flex items-center gap-1 truncate">
                {at > 0 && !task.fields[at - 1]!.client ? <span aria-hidden="true">·</span> : null}
                {/* Only the client carries a colour on a card. See ADR-0038. */}
                {field.value}
              </span>
            ),
          )}
        </span>
      ) : null}
      {task.due_date ? <span className="ml-auto shrink-0 tabular-nums">{task.due_date}</span> : null}
    </span>
  );
}
