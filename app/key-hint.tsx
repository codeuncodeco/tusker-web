/**
 * The mark a control carries to name its key.
 *
 * A button that says "Plan" and never says `p` teaches nothing, and a sentence
 * under the list teaches it once. So the key rides on the control. A row that
 * drags has no reorder button, so its list names those keys once, above the
 * rows: `KeyLegend`. See ADR-0026.
 *
 * The two forms do not agree, on purpose. The eye reads `⇧K`. The machine reads
 * `Shift+K`, which is the grammar `aria-keyshortcuts` takes.
 */

import { KEY_MAP, type ActionName } from "./key-map";

/** True for a key a person can only press with Shift held. */
function shifted(key: string): boolean {
  return key.length === 1 && key !== key.toLowerCase();
}

/**
 * The press as the eye reads it. `Escape` is the one press with a short name
 * everybody already writes, and the decision prompt writes it that way.
 */
function seen(key: string): string {
  if (key === "Escape") return "Esc";
  return shifted(key) ? `⇧${key}` : key;
}

/** The press as `aria-keyshortcuts` takes it, which is its own grammar. */
function spoken(key: string): string {
  return shifted(key) ? `Shift+${key}` : key;
}

/**
 * The two halves of a hint: the attribute for the control, and the mark to
 * draw after its label. The attribute belongs on the control and the mark
 * belongs inside it, so the caller spreads one and draws the other.
 *
 * The mark shows only where the pointer is fine, because a phone has no
 * keyboard. The attribute stays either way: it is read, not seen.
 */
export function keyHint(action: ActionName) {
  return keyMark(KEY_MAP[action].key);
}

/**
 * The same, for a press no list act names: the task page's `Esc`, and the
 * `e` that opens its description. One press is drawn one way, wherever the
 * control sits.
 */
export function keyMark(key: string) {
  return {
    keys: { "aria-keyshortcuts": spoken(key) },
    hint: (
      <kbd aria-hidden="true" className="ml-1 hidden pointer-fine:inline">
        {seen(key)}
      </kbd>
    ),
  };
}

/**
 * The keys of acts no control carries, named once above the list they act on.
 * A row that drags has no reorder button for its key to ride on, and a key
 * nothing names is a key nobody finds. See ADR-0026.
 *
 * It shows where the pointer is fine, as every other mark does.
 */
export function KeyLegend({ acts }: { acts: ActionName[] }) {
  return (
    <p className="hidden gap-3 text-xs text-dim pointer-fine:flex">
      {acts.map((act) => {
        const mark = keyHint(act);
        return (
          <span key={act} {...mark.keys}>
            {KEY_MAP[act].label}
            {mark.hint}
          </span>
        );
      })}
    </p>
  );
}
