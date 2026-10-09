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
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useLocation } from "react-router";

import { KeyGuide, guideFor, type GuideLine } from "./key-guide";
import { fires } from "./key-map";
import { isPagePress } from "./keys";

/** The arrows a list swallows: they move the cursor, so they never scroll. */
export const LIST_ARROWS = ["ArrowUp", "ArrowDown"] as const;

/** The four a board swallows, because a board's cursor moves both ways. */
export const BOARD_ARROWS = [...LIST_ARROWS, "ArrowLeft", "ArrowRight"] as const;

/**
 * One page's keyed surface: the list that holds the keys, the quick-add box
 * `n` moves the focus to, and the Key guide that names the keys.
 *
 * The three are drawn by components that never meet — a route puts the box
 * above the list, a board puts it above its columns, and the header carries
 * the guide's menu item — so the surface is where they find each other. The
 * box is kept as its own ref and not as the element, so the surface always
 * reads the box that is on screen now.
 */
type Surface = {
  list: RefObject<HTMLElement | null>;
  box: RefObject<RefObject<HTMLTextAreaElement | null> | null>;
  /**
   * Hands the surface the lines of the guide, or takes them back as the list
   * goes. It reads them as the guide opens, so the guide names the page as it
   * stands then.
   */
  give: (lines: (() => GuideLine[]) | null) => void;
  /** Opens the guide. The focus goes back to `back` as it closes. */
  guide: (back: HTMLElement | null) => void;
};

const SurfaceContext = createContext<Surface | null>(null);

/**
 * True while the page gives list keys, which is while it has a guide to open.
 * It is apart from the surface because it changes, and the surface must not:
 * every list binds its elements through it.
 */
const GivenContext = createContext(false);

/**
 * What a page outside a provider reads: a surface with nothing on it. A test
 * that renders one list on its own has no provider, and so has this.
 */
const NONE: Surface = {
  list: { current: null },
  box: { current: null },
  give: () => {},
  guide: () => {},
};

/**
 * The surface every page has, mounted once. A page draws one keyed list or
 * none, so one surface serves the whole app and a move between pages empties
 * it: the list and the box both release it as they unmount.
 *
 * It draws the Key guide, because the list and the person menu both open it.
 */
export function KeyedSurfaceProvider({ children }: { children: ReactNode }) {
  const list = useRef<HTMLElement | null>(null);
  const box = useRef<RefObject<HTMLTextAreaElement | null> | null>(null);
  const lines = useRef<(() => GuideLine[]) | null>(null);
  // Where the focus was as the guide opened, which is where it goes back to.
  const back = useRef<HTMLElement | null>(null);
  const [given, setGiven] = useState(false);
  const [shown, setShown] = useState<GuideLine[] | null>(null);

  const surface = useMemo<Surface>(
    () => ({
      list,
      box,
      give: (next) => {
        lines.current = next;
        setGiven(next !== null);
      },
      guide: (from) => {
        if (!lines.current) return;
        back.current = from;
        setShown(lines.current());
      },
    }),
    [],
  );

  // The focus goes back where it was, so a person who opened the guide from a
  // list is in that list again with the cursor where they left it. A place
  // the page no longer draws gives it to the list. See ADR-0022.
  const close = useCallback(() => {
    setShown(null);
    (back.current?.isConnected ? back.current : list.current)?.focus({ preventScroll: true });
  }, []);

  return (
    <SurfaceContext.Provider value={surface}>
      <GivenContext.Provider value={given}>
        {children}
        {shown ? <KeyGuide lines={shown} close={close} /> : null}
      </GivenContext.Provider>
    </SurfaceContext.Provider>
  );
}

export function useSurface(): Surface {
  return useContext(SurfaceContext) ?? NONE;
}

/**
 * The guide as the person menu reads it: whether the page has one, and the
 * way to open it.
 */
export function useKeyGuide(): { given: boolean; open: (back: HTMLElement | null) => void } {
  const surface = useSurface();
  return { given: useContext(GivenContext), open: surface.guide };
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
 * What a keyed list does with one press, and whether it keeps it. The hook
 * cancels a press this keeps. It reads the event and touches no page, so a
 * test can ask what a press does without one.
 *
 * `press` is the list's own map, and it says whether the list took the press.
 * `swallow` is what the list keeps whichever way that answers: an arrow at the
 * end of a list must not scroll the page, or a key that moves the cursor
 * everywhere else would scroll there, which is two keys wearing one label.
 */
export function readPress(
  event: KeyboardEvent,
  list: {
    press: (key: string) => boolean;
    /** Opens the Key guide. */
    guide: () => void;
    /** The quick-add box the surface draws, where it draws one. */
    box: HTMLElement | null | undefined;
    swallow: readonly string[];
  },
): boolean {
  if (!isPagePress(event)) return false;

  if (list.press(event.key)) return true;

  // `?` is bound here and on no window, so a press in a box types it and a
  // press anywhere else on the page does nothing. See ADR-0022.
  if (fires("guide", event.key)) {
    list.guide();
    return true;
  }

  // `n` is the one key that leaves the list, and it goes to the box this
  // surface draws. A page with no box, which is focus mode, keeps its own
  // meaning for the press.
  if (fires("add", event.key) && list.box) {
    list.box.focus();
    return true;
  }

  return list.swallow.includes(event.key);
}

/**
 * Binds one list's keys to the elements that hold its rows, and answers with
 * the props each of them takes.
 *
 * `press` and `swallow` are what `readPress` reads. `lines` are the acts the
 * list gives, which the Key guide names. The guide adds two of its own: `n`
 * where the page draws a box, and `?`, which every list gives.
 */
export function useKeyedList(
  press: (key: string) => boolean,
  swallow: readonly string[],
  lines: GuideLine[],
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

  // The guide reads the lines as it opens, so a page whose acts change, as
  // plan mode's do from one day to the next, names the ones it gives now.
  const listLines = useRef(lines);
  listLines.current = lines;
  useEffect(() => {
    surface.give(() => guideFor(listLines.current, Boolean(surface.box.current?.current)));
    return () => surface.give(null);
  }, [surface]);

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const kept = readPress(event.nativeEvent, {
      press,
      // The focus goes back to where the press was made: the list, or a
      // row's own button inside it.
      guide: () =>
        surface.guide(document.activeElement instanceof HTMLElement ? document.activeElement : null),
      box: surface.box.current?.current,
      swallow,
    });
    if (kept) event.preventDefault();
  }

  // The list the focus is in is the list a prompt gives it back to, which on
  // a board is the column the person was working and not the first one.
  function onFocus(event: React.FocusEvent<HTMLElement>) {
    surface.list.current = event.currentTarget;
  }

  return (label) => ({ tabIndex: 0, "aria-label": label, ref, onKeyDown, onFocus });
}
