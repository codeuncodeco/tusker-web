/**
 * The Today meter: how much of today's plan is done, as a bar that fills. It
 * is the progress bar a game draws over a level, and it glows when the plan is
 * cleared. It reads the plan and nothing else, so it says what the person set
 * out to do today and not what the board happens to hold. A click opens the
 * plan.
 */

import { Link } from "react-router";

export function TodayMeter({ done, planned }: { done: number; planned: number }) {
  if (planned === 0) return null;
  const share = Math.min(1, done / planned);
  const cleared = done >= planned;

  return (
    <Link
      to="/me/plan"
      title="Today's plan"
      aria-label={`Today's plan: ${done} of ${planned} done`}
      className="press inline-flex items-center gap-2 self-center rounded-full px-1 text-xs text-muted hover:text-fg"
    >
      <span
        aria-hidden="true"
        className={`relative h-2 w-24 overflow-hidden rounded-full bg-surface-2 ring-1 ring-border ${cleared ? "motion-safe:animate-glow" : ""}`}
      >
        <span
          style={{ width: `${share * 100}%` }}
          className="absolute inset-y-0 left-0 rounded-full bg-win transition-[width] duration-700 ease-spring"
        />
      </span>
      <span aria-hidden="true" className="tabular-nums">
        {cleared ? (
          <strong className="font-semibold text-win motion-safe:animate-pop">Day cleared</strong>
        ) : (
          <>
            <strong key={done} className="inline-block font-semibold text-fg motion-safe:animate-tick">
              {done}
            </strong>
            /{planned} today
          </>
        )}
      </span>
    </Link>
  );
}
