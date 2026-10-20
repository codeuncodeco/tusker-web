/**
 * A row of palette swatches, each one a button: one click picks a colour.
 *
 * Every swatch is a submit button of the form around it, named and valued, so
 * with no script a click posts the pick as a plain form does. With script the
 * caller's `onPick` takes the click instead, and posts through a fetcher, so
 * the page does not move.
 */

import { ASSIGNABLE, colorCss } from "./colors";
import { Check } from "./icons";

export function Swatches({
  name,
  value,
  label,
  onPick,
  names = ASSIGNABLE,
  extra,
}: {
  /** The form field a pick posts under. */
  name: string;
  /** The colour held now: a palette name, an exact colour, or null. */
  value: string | null;
  /** What a screen reader hears for the row. */
  label: string;
  onPick?: (color: string) => void;
  /** The palette names offered, the assignable ones unless the caller says. */
  names?: readonly string[];
  /** Anything after the swatches: a custom picker, a Clear. */
  extra?: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {names.map((color) => {
        const held = value === color;
        return (
          <button
            key={color}
            name={name}
            value={color}
            aria-pressed={held}
            aria-label={color}
            title={color}
            onClick={(event) => {
              if (!onPick) return;
              event.preventDefault();
              onPick(color);
            }}
            style={{ backgroundColor: colorCss(color) }}
            className={`press flex size-7 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-bg hover:scale-110 ${held ? "ring-2 ring-fg motion-safe:animate-pop-soft" : ""}`}
          >
            {held ? <Check className="size-3" /> : null}
          </button>
        );
      })}
      {extra}
    </div>
  );
}
