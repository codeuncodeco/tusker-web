import type { Holder } from "./assignees";

/**
 * The mark a card draws for the members who hold a task: their initials, the
 * way the extension drew them.
 *
 * The name is the accessible text, because two letters name nobody to a person
 * reading with their ears. A task nobody holds draws nothing: unassigned is
 * read from the board's filter, not from an empty badge on every card.
 */
export function Initials({ holders }: { holders: Holder[] }) {
  if (holders.length === 0) return null;

  return (
    <ul className="flex shrink-0 gap-1">
      {holders.map((holder) => (
        <li
          key={holder.id}
          title={holder.name}
          className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
        >
          <span className="sr-only">{holder.name}</span>
          <span aria-hidden="true">{holder.initials}</span>
        </li>
      ))}
    </ul>
  );
}
