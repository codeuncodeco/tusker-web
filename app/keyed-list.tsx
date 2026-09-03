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
import { useLocation } from "react-router";

import { fires } from "./key-map";
import { isPagePress } from "./keys";

/** The arrows a list swallows: they move the cursor, so they never scroll. */
export const LIST_ARROWS = ["ArrowUp", "ArrowDown"] as const;

/** The four a board swallows, because a board's cursor moves both ways. */
export const BOARD_ARROWS = [...LIST_ARROWS, "ArrowLeft", "ArrowRight"] as const;

/**
 * One page's keyed surface: the list that holds the keys, and the quick-add
 * box `n` moves the focus to.
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

/**
 * What a page outside a provider reads: a surface with nothing on it. A test
 * that renders one list on its own has no provider, and so has this.
 */
const NONE: Surface = { list: { current: null }, box: { current: null } };

/**
 * The surface every page has, mounted once. A page draws one keyed list or
 * none, so one surface serves the whole app and a move between pages empties
 * it: the list and the box both release it as they unmount.
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
  onFocus: (event: React.FocusEvent<HTMLElement>) => void;
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
  const { pathname } = useLocation();
  // Every element this list binds, in the order the page draws them. The first
  // is the one that takes the focus when the page arrives.
  const nodes = useRef<HTMLElement[]>([]);
  // The path the focus was taken for. One page draws one keyed list, so the
  // path is what says this is another list and not the same one redrawn.
  const taken = useRef<string | null>(null);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      // In page order, and not in the order the refs arrived: a column drawn
      // again after a toggle registers last and is still not the first list.
      nodes.current = [...nodes.current, node].sort((one, next) =>
        one.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      );
      surface.list.current ??= nodes.current[0];

      return () => {
        nodes.current = nodes.current.filter((one) => one !== node);
        if (surface.list.current === node) surface.list.current = nodes.current[0] ?? null;
      };
    },
    [surface],
  );

  // Once for every page, and never on a re-render of the same one: a fetcher
  // answering must not pull the focus out of the button a person is working,
  // and a walk to another day is a page that has to arm its own keys. The
  // container is focused and no card is: a card would make a screen reader
  // announce a task nobody asked for. See ADR-0022.
  //
  // It reads after every render, because a list draws nothing until its rows
  // are there, and the first element to arrive is the one to focus.
  useEffect(() => {
    if (taken.current === pathname) return;
    const first = nodes.current[0];
    if (!first) return;
    taken.current = pathname;
    first.focus({ preventScroll: true });
  });

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
    if (fires("add", event.key) && box) {
      box.focus();
      event.preventDefault();
      return;
    }

    if (swallow.includes(event.key)) event.preventDefault();
  }

  // The list the focus is in is the list a prompt gives it back to, which on
  // a board is the column the person was working and not the first one.
  function onFocus(event: React.FocusEvent<HTMLElement>) {
    surface.list.current = event.currentTarget;
  }

  return (label) => ({ tabIndex: 0, "aria-label": label, ref, onKeyDown, onFocus });
}
