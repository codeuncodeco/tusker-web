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
  | "forward"
  | "back"
  | "finish"
  | "more";

export type KeyRow = {
  /** The press, as `KeyboardEvent.key` gives it. */
  key: string;
  /** What the act reads where a control names it. */
  label: string;
};

export const KEY_MAP: Record<ActionName, KeyRow> = {
  next: { key: "j", label: "Next" },
  prev: { key: "k", label: "Previous" },
  open: { key: "Enter", label: "Open" },
  // Plan and unplan are one press: the page's list decides which way it turns.
  plan: { key: "p", label: "Plan" },
  unplan: { key: "p", label: "Unplan" },
  up: { key: "K", label: "Up" },
  down: { key: "J", label: "Down" },
  forward: { key: ">", label: "Forward" },
  back: { key: "<", label: "Back" },
  finish: { key: "x", label: "Finish" },
  more: { key: "n", label: "Take three more" },
};
