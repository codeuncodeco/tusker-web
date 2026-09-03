/**
 * The walk: the controls that carry a dated page from one key to the next.
 *
 * Plan mode walks days and the week page walks weeks. The two read the same,
 * because they are one act: the key before, the key itself as a link to its
 * own address, the key after, and the one step home.
 *
 * The key is a link because the address is the thing a person keeps. `/me/plan`
 * is whichever day the person is in, and `/me/plan/2026-08-25` is that day and
 * no other. Without these controls no person reaches the named page at all.
 * See #66 and #142.
 *
 * The walk itself refuses nothing. A key past its own reads back, a key ahead
 * of it plans, and the page it lands on says which of the two it is.
 */

import { Link } from "react-router";

/** The look of one step of the walk. */
const STEP = "rounded border border-border px-2 text-muted";

export function Walk({
  /** What a screen reader calls this walk: "Day", or "Week". */
  label,
  /** The key the page speaks for, which is what the middle link names. */
  here,
  prev,
  next,
  /** The address one key takes, which is the page's own route. */
  href,
  /** True where the page is already home, and the way home is drawn for
   * nobody: "Today" on today, "This week" in this week. */
  atHome,
  /** Where home is, and what it reads. */
  home,
  homeLabel,
}: {
  label: string;
  here: string;
  prev: string;
  next: string;
  href: (key: string) => string;
  atHome: boolean;
  home: string;
  homeLabel: string;
}) {
  return (
    <nav aria-label={label} className="flex items-baseline gap-2">
      <Link to={href(prev)} aria-label={`The ${label.toLowerCase()} before, ${prev}`} className={STEP}>
        ‹
      </Link>

      <Link to={href(here)} className="tabular-nums text-muted underline-offset-2 hover:underline">
        {here}
      </Link>

      <Link to={href(next)} aria-label={`The ${label.toLowerCase()} after, ${next}`} className={STEP}>
        ›
      </Link>

      {/* The one step home, from however far the walk went. */}
      {atHome ? null : (
        <Link to={home} className="text-muted underline-offset-2 hover:underline">
          {homeLabel}
        </Link>
      )}
    </nav>
  );
}
