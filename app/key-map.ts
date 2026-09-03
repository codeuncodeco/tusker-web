/**
 * One row per list act: the key that fires it, and the label that names it.
 *
 * Tusker is keyboard first, so a key is part of the control and not a sentence
 * under it. One table holds the pairs, so a button and a binding cannot say
 * different keys.
 *
 * This file holds data and no logic. `app/keys.ts` decides which press is the
 * page's, which is a different job. The guards — what a task, a plan set and an
 * order allow — stay in `app/unified-keys.ts`, because a guard reads all three
 * and a map that read them would stop being a map.
 */

/** Every act a keyed list binds. */
export type ActionName =
  | "next"
  | "prev"
  | "open"
  | "plan"
  | "unplan"
  | "up"
  | "down"
  | "top"
  | "forward"
  | "back"
  | "finish"
  | "more"
  | "clear";

export type KeyRow = {
  /** The press, as `KeyboardEvent.key` gives it. */
  key: string;
  /**
   * A second press that fires the same act. Only the cursor has one: the
   * arrows are what a person reaches for to move a cursor, and they are the
   * only scroll keys a keyboard-only person has, so a list that binds them
   * must own them wherever it is drawn. See ADR-0022.
   */
  alias?: string;
  /** What the act reads where a control names it. */
  label: string;
};

/** True where one press fires an act: its key, or the arrow that aliases it. */
export function fires(action: ActionName, key: string): boolean {
  const row = KEY_MAP[action];
  return key === row.key || key === row.alias;
}

export const KEY_MAP: Record<ActionName, KeyRow> = {
  next: { key: "j", alias: "ArrowDown", label: "Next" },
  prev: { key: "k", alias: "ArrowUp", label: "Previous" },
  open: { key: "Enter", label: "Open" },
  // Plan and unplan are one press: the page's list decides which way it turns.
  plan: { key: "p", label: "Plan" },
  unplan: { key: "p", label: "Unplan" },
  up: { key: "K", label: "Up" },
  down: { key: "J", label: "Down" },
  // The third of the family that moves a row. A press is a `KeyboardEvent.key`
  // and nothing else, so the capital is the whole binding. See ADR-0021.
  top: { key: "T", label: "Top" },
  forward: { key: ">", label: "Forward" },
  back: { key: "<", label: "Back" },
  finish: { key: "x", label: "Finish" },
  more: { key: "n", label: "Take three more" },
  // The one act with no control to carry it: a cleared cursor names nothing,
  // so there is no card for a button to sit on. See ADR-0015.
  clear: { key: "Escape", label: "Clear cursor" },
};
