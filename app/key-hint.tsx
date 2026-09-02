/**
 * The mark a control carries to name its key.
 *
 * A button that says "Plan" and never says `p` teaches nothing, and a sentence
 * under the list teaches it once. So the key rides on the control.
 *
 * The two forms do not agree, on purpose. The eye reads `⇧K`. The machine reads
 * `Shift+K`, which is the grammar `aria-keyshortcuts` takes.
 */

import { KEY_MAP, type ActionName } from "./key-map";

/** True for a key a person can only press with Shift held. */
function shifted(key: string): boolean {
  return key.length === 1 && key !== key.toLowerCase();
}

/** The press as the eye reads it. */
function seen(key: string): string {
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
  const { key } = KEY_MAP[action];

  return {
    keys: { "aria-keyshortcuts": spoken(key) },
    hint: (
      <kbd aria-hidden="true" className="ml-1 hidden pointer-fine:inline">
        {seen(key)}
      </kbd>
    ),
  };
}
