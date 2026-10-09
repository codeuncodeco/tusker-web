/**
 * The Key guide: the dialog that names every list key the page a person stands
 * on gives.
 *
 * A key rides on the control that does its act, so most keys are found where
 * they are pressed. Some acts have no control: a row that drags carries no
 * reorder button, and the cursor has none at all. The guide is the one place a
 * person learns those. `?` opens it from inside a keyed list, and "Keys ?" in
 * the person menu opens it from anywhere on the page. See #206.
 *
 * A page with no keyed list gives no list key, so it has no guide.
 */

import { useEffect, useRef } from "react";

import { seen } from "./key-hint";
import { KEY_MAP, type ActionName } from "./key-map";

/** One line of the guide: an act, and what the page calls it. */
export type GuideLine = { act: ActionName; label: string };

/** One line, named the way the key map names it unless the page says. */
export function line(act: ActionName, label = KEY_MAP[act].label): GuideLine {
  return { act, label };
}

const ORDER = Object.keys(KEY_MAP) as ActionName[];

/**
 * The lines in the key map's order, so every page lists its keys the same way
 * round whichever of them it gives.
 */
function inMapOrder(lines: GuideLine[]): GuideLine[] {
  return [...lines].sort((one, next) => ORDER.indexOf(one.act) - ORDER.indexOf(next.act));
}

/**
 * Every line one page's guide names: the acts its list gives, `n` where it
 * draws a quick-add box, and `?`, which every keyed list gives. Focus mode
 * draws no box, and there `n` is the offer's, which names itself.
 */
export function guideFor(lines: GuideLine[], box: boolean): GuideLine[] {
  return inMapOrder([...lines, ...(box ? [line("add")] : []), line("guide")]);
}

/**
 * The dialog. Esc and a click outside close it. It takes the focus as it
 * opens, so the list behind it hears no press while it is up, and the surface
 * gives the focus back as it closes. See ADR-0022.
 */
export function KeyGuide({ lines, close }: { lines: GuideLine[]; close: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => dialog.current?.focus({ preventScroll: true }), []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // One press means one thing: the cursor behind the guide stays where it
      // was.
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);

  // Over the board's sticky header (`z-20`) and Top row (`z-10`), so the
  // shade dims them as well.
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
      // A press on the shade is a click outside. One inside the dialog lands
      // on the dialog first, so it never closes it.
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="key-guide"
        tabIndex={-1}
        ref={dialog}
        className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-6 focus:outline-none"
      >
        <h2 id="key-guide" className="text-lg tracking-tight">
          {KEY_MAP.guide.label}
        </h2>
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5">
          {lines.map((one) => (
            <div key={one.act} className="contents">
              <dt className="text-muted">{one.label}</dt>
              <dd className="justify-self-end">
                <kbd>{seen(KEY_MAP[one.act].key)}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
