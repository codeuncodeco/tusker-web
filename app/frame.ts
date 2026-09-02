/**
 * The board frame: the two board pages hold still, and a card list scrolls
 * inside its own column.
 *
 * Every other page keeps document scroll, so the height must be a page's
 * choice and not the layout's. A page that wants the frame exports the handle,
 * and the layout it sits under reads the handle off the matches. That keeps
 * the layouts free of any list of paths: the page says what it needs.
 *
 * The frame is off below `sm`. A fixed frame on a phone gives a scroller
 * inside a scroller and a two-card window, so every class the frame adds is
 * `sm:`-prefixed and the small screen keeps document scroll.
 *
 * The classes themselves are written where they are used, and not named here.
 * A flex item will not shrink under its content unless it is told it may, so
 * the chain from the window to the card list is `sm:min-h-0` at every link,
 * and one link left out gives the page its scrollbar back.
 */

import { useMatches } from "react-router";

/** What a board route exports: `export const handle = { frame: true }`. */
export type FrameHandle = { frame?: boolean };

/** True while the page under this layout asked for the frame. */
export function useFrame(): boolean {
  return useMatches().some((match) => (match.handle as FrameHandle | undefined)?.frame === true);
}
