/**
 * The ring before a card's title: one click finishes the task, and a burst
 * says so. A finished task's ring is ticked, and a click on it opens the task
 * again. It sits in the card's title line, so it adds width and never a line.
 * See ADR-0026, which this keeps: `x` still finishes, and a drag still does.
 */

import { celebrateAt } from "./celebrate";
import { Circle, CircleCheck } from "./icons";

export function FinishCircle({
  finished,
  title,
  color,
  onFinish,
  onReopen,
}: {
  finished: boolean;
  /** The task's title, so a screen reader hears which task the ring finishes. */
  title: string;
  /** The burst's colour: the org's, where the card names one. */
  color?: string;
  onFinish: () => void;
  onReopen: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={finished ? `Open ${title} again` : `Finish ${title}`}
      title={finished ? "Open it again" : "Finish x"}
      onClick={(event) => {
        // The card puts the cursor on itself, and the ring is an act, not a pick.
        event.stopPropagation();
        if (finished) {
          onReopen();
          return;
        }
        celebrateAt(event.currentTarget, color);
        onFinish();
      }}
      className={`press group/ring relative -my-1 flex size-6 shrink-0 items-center justify-center self-center rounded-full ${
        finished ? "text-win" : "text-dim hover:text-win"
      }`}
    >
      {finished ? (
        <CircleCheck className="size-4 motion-safe:animate-pop" />
      ) : (
        <>
          {/* The icon sets its own display, so the swap is on a wrapper. */}
          <span className="flex group-hover/ring:hidden">
            <Circle className="size-4" />
          </span>
          <span className="hidden group-hover/ring:flex">
            <CircleCheck className="size-4" />
          </span>
        </>
      )}
    </button>
  );
}
