import type { Assignee } from "./assignees";
import { colorCss } from "./colors";

/** The sizes an avatar draws at: a card's, a picker's, and the account page's. */
const SIZES = {
  sm: "size-6 text-[0.625rem]",
  md: "size-7 text-[0.6875rem]",
  lg: "size-20 text-2xl",
} as const;

export type AvatarSize = keyof typeof SIZES;

/**
 * The paint one person's avatar takes: a tint of their colour behind their
 * initials, and a ring of the colour itself. A person with no colour draws in
 * the page's own greys. See ADR-0034.
 */
export function avatarStyle(color: string | undefined | null): React.CSSProperties {
  if (!color) return {};
  const paint = colorCss(color);
  return {
    backgroundColor: `color-mix(in oklab, ${paint} 22%, var(--color-bg))`,
    borderColor: paint,
  };
}

/**
 * One person's mark: their picture where they keep one, and their initials on
 * their colour where they do not. The colour rings the picture too, so a
 * person reads the same either way.
 *
 * It is a picture of a name, so it hides itself from a screen reader; the
 * caller says the name.
 */
export function Avatar({
  person,
  size = "sm",
  className = "",
}: {
  person: Pick<Assignee, "initials" | "color" | "image">;
  size?: AvatarSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={avatarStyle(person.color)}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-border bg-surface-2 font-semibold uppercase leading-none tracking-wide text-fg ${SIZES[size]} ${className}`}
    >
      {person.image ? (
        <img src={person.image} alt="" className="size-full object-cover" draggable={false} />
      ) : (
        person.initials
      )}
    </span>
  );
}

/**
 * The mark a card draws for the members who hold a task: their avatars, laid
 * over each other a little, the way a game draws a party.
 *
 * The name is the accessible text, because two letters name nobody to a person
 * reading with their ears. A task nobody holds draws nothing: unassigned is
 * read from the board's filter, not from an empty badge on every card.
 */
export function Initials({ assignees }: { assignees: Assignee[] }) {
  if (assignees.length === 0) return null;

  return (
    <ul className="flex shrink-0 -space-x-1.5">
      {assignees.map((assignee) => (
        <li key={assignee.id} title={assignee.name} className="flex rounded-full ring-2 ring-bg">
          <span className="sr-only">{assignee.name}</span>
          <Avatar person={assignee} />
        </li>
      ))}
    </ul>
  );
}
