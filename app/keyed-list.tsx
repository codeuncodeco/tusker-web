/**
 * The keyed list: the element that holds the rows, takes the focus and binds
 * the keys.
 *
 * Every list key used to sit on `window`. That put `j`, `x` and `n` live on
 * the whole page, all the time, so a speech-input user saying a word fired
 * them, and no arrow could join them without taking page scroll away. The keys
 * are now live only while focus is inside the list, which is what WCAG 2.1.4
 * asks of a shortcut on a single character key. See ADR-0022.
 *
 * The listener reads bubbling `keydown`, so a key still works while focus sits
 * on a row's own button. The container takes `tabindex` and a name and no
 * `role`: a row holds a Link and four buttons, so the list is no listbox, and
 * the grid is a much larger change. The cursor stays React state, drawn with
 * `aria-current`.
 *
 * A board draws five of these, one per column, and they share one cursor and
 * one binding. That is what keeps the rule true on every surface: a keyed list
 * wraps rows and nothing else, so no box is ever inside one.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

import { isPagePress } from "./keys";

/**
 * The key that leaves the list for the surface's quick-add box. It is not a
 * list act, so it is not in `app/key-map.ts`: it names a box, and the list
 * only hands the press over.
 */
export const ADD_KEY = "n";

/** The arrows a list swallows: they move the cursor, so they never scroll. */
export const LIST_ARROWS = ["ArrowUp", "ArrowDown"] as const;

/** The four a board swallows, because a board's cursor moves both ways. */
export const BOARD_ARROWS = [...LIST_ARROWS, "ArrowLeft", "ArrowRight"] as const;

/**
 * One page's keyed surface: the list that holds the keys, and the quick-add
 * box `n` hands the press to.
 *
 * The two are drawn by components that never meet — a route puts the box above
 * the list, and a board puts one on every column — so the surface is where
 * they find each other. The box is kept as its own ref and not as the element,
 * so the surface always reads the box that is on screen now.
 */
type Surface = {
  list: RefObject<HTMLElement | null>;
  box: RefObject<RefObject<HTMLTextAreaElement | null> | null>;
};

const SurfaceContext = createContext<Surface | null>(null);

/** What a page outside a provider reads: a surface with nothing on it. */
const NONE: Surface = { list: { current: null }, box: { current: null } };

/**
 * The surface every page has, mounted once. A page draws one keyed list or
 * none, so one surface serves the whole app and a move between pages empties
 * it: the list and the box both let go as they unmount.
 */
export function KeyedSurfaceProvider({ children }: { children: ReactNode }) {
  const list = useRef<HTMLElement | null>(null);
  const box = useRef<RefObject<HTMLTextAreaElement | null> | null>(null);
  const surface = useMemo(() => ({ list, box }), []);

  return <SurfaceContext.Provider value={surface}>{children}</SurfaceContext.Provider>;
}

export function useSurface(): Surface {
  return useContext(SurfaceContext) ?? NONE;
}

/** Puts the focus back on the keyed list, for a control that took it away. */
export function useKeyedFocus(): () => void {
  const surface = useSurface();
  return useCallback(() => surface.list.current?.focus({ preventScroll: true }), [surface]);
}

/** What a keyed container takes. One list spreads it on every element it holds. */
export type Keyed = {
  tabIndex: 0;
  "aria-label": string;
  ref: (node: HTMLElement | null) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
};

/**
 * Binds one list's keys to the elements that hold its rows, and answers with
 * the props each of them takes.
 *
 * `press` is the list's own map, and it says whether the list took the press.
 * `swallow` is what the list keeps whichever way that answers: an arrow at the
 * end of a list must not scroll the page, or a key that moves the cursor
 * everywhere else would scroll there, which is two keys wearing one label.
 */
export function useKeyedList(
  press: (key: string) => boolean,
  swallow: readonly string[],
): (label: string) => Keyed {
  const surface = useSurface();
  // Every element this list binds, in the order they were drawn. The first is
  // the one that takes the focus, and the one a prompt gives it back to.
  const nodes = useRef<HTMLElement[]>([]);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      nodes.current = [...nodes.current, node];
      surface.list.current = nodes.current[0];

      return () => {
        nodes.current = nodes.current.filter((one) => one !== node);
        surface.list.current = nodes.current[0] ?? null;
      };
    },
    [surface],
  );

  // On mount and never again, so a client-side navigation into a keyed page
  // arms the keys as a load does, and a fetcher answering does not pull the
  // focus out of the button a person is working. The refs are attached by the
  // time this runs. The container is focused and no card is: a card would make
  // a screen reader announce a task nobody asked for. See ADR-0022.
  useEffect(() => {
    nodes.current[0]?.focus({ preventScroll: true });
  }, []);

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (!isPagePress(event.nativeEvent)) return;

    if (press(event.key)) {
      event.preventDefault();
      return;
    }

    // `n` is the one key that leaves the list, and it goes to the box this
    // surface draws. A page with no box, which is focus mode, keeps its own
    // meaning for the press.
    const box = surface.box.current?.current;
    if (event.key === ADD_KEY && box) {
      box.focus();
      event.preventDefault();
      return;
    }

    if (swallow.includes(event.key)) event.preventDefault();
  }

  return (label) => ({ tabIndex: 0, "aria-label": label, ref, onKeyDown });
}
