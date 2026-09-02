import type { Assignee } from "./assignees";

/**
 * The mark a card draws for the members who hold a task: their initials, the
 * way the extension drew them.
 *
 * The name is the accessible text, because two letters name nobody to a person
 * reading with their ears. A task nobody holds draws nothing: unassigned is
 * read from the board's filter, not from an empty badge on every card.
 */
export function Initials({ assignees }: { assignees: Assignee[] }) {
  if (assignees.length === 0) return null;

  return (
    <ul className="flex shrink-0 gap-1">
      {assignees.map((assignee) => (
        <li
          key={assignee.id}
          title={assignee.name}
          className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-muted"
        >
          <span className="sr-only">{assignee.name}</span>
          <span aria-hidden="true">{assignee.initials}</span>
        </li>
      ))}
    </ul>
  );
}
