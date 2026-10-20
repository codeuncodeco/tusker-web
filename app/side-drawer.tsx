/**
 * Backlog and Cancelled, kept off the board. See ADR-0038 and ADR-0039.
 *
 * - **Backlog** is a tab at the left edge of the screen, hidden but for its
 *   grip. A click, or a pull to the right, slides a drawer out over the board.
 * - **Cancelled** is a tab at the bottom left, hidden but for its grip. A
 *   click, or a pull up, raises a sheet from the foot of the screen.
 *
 * A tab whose column holds nothing is not drawn: there is nothing to pull.
 *
 * A tab is a link that flips `backlog=1` or `cancelled=1`, so an open drawer is
 * an address and the loader reads its cards. While a drawer is out its tab
 * rides on its edge, as a handle; a click on it, the ✕, or Escape inside puts
 * it away. Both are drawn inside the board's drag context, so a card drags
 * from them onto the board and back.
 */

import { useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { flipped, type Status } from "./board";
import { CircleXMark, Inbox, XMark } from "./icons";

/** The columns kept off the board. */
export const SIDE_STATUSES = ["backlog", "cancelled"] as const satisfies readonly Status[];

export type SideStatus = (typeof SIDE_STATUSES)[number];

/** True for a column a drawer holds rather than the board. */
export function isSide(status: Status): status is SideStatus {
  return (SIDE_STATUSES as readonly Status[]).includes(status);
}

/** How wide the Backlog drawer is, in rem. */
const DRAWER_REM = 20;

/** How tall the Cancelled sheet is, as a share of the screen. */
const SHEET_VH = 46;

/** How far a pull must travel before it opens, in px. */
const PULL = 24;

/** The words a tab says to a screen reader. */
function tabName(out: boolean, label: string, count: number): string {
  return `${out ? "Put away" : "Pull out"} ${label}, ${count} ${count === 1 ? "task" : "tasks"}`;
}

/**
 * A press that opens when it is pulled far enough one way: right for the
 * Backlog tab, up for the Cancelled tab.
 */
function usePull(to: string, out: boolean, axis: "right" | "up") {
  const navigate = useNavigate();
  const from = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (event: React.PointerEvent) => {
      from.current = { x: event.clientX, y: event.clientY };
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (!from.current || out) return;
      const moved = axis === "right" ? event.clientX - from.current.x : from.current.y - event.clientY;
      if (moved > PULL) {
        from.current = null;
        navigate(to, { preventScrollReset: true });
      }
    },
    onPointerUp: () => {
      from.current = null;
    },
    onPointerLeave: () => {
      from.current = null;
    },
  };
}

/** The Backlog tab, at the left edge. `calls` makes it glow for a look. */
export function BacklogTab({ open, count, calls = false }: { open: boolean; count: number; calls?: boolean }) {
  const [params] = useSearchParams();
  const to = flipped(params, "backlog", open);
  const pull = usePull(to, open, "right");
  if (count === 0 && !open) return null;

  return (
    <Link
      to={to}
      preventScrollReset
      {...pull}
      aria-label={tabName(open, "Backlog", count)}
      title={`${open ? "Put away" : "Pull out"} Backlog`}
      style={{ left: open ? `${DRAWER_REM}rem` : 0 }}
      // Shut, the tab hides behind the screen's edge but for its grip, and the
      // pointer over it slides it out to read. Open, it is the drawer's handle.
      className={`press group fixed top-20 z-40 flex items-stretch rounded-r-xl border border-l-0 shadow-md transition-[left,translate] duration-300 ease-snap hover:translate-x-0 focus-visible:translate-x-0 print:hidden ${
        open ? "translate-x-0 border-fg bg-fg text-bg" : "-translate-x-8 border-border bg-surface text-muted hover:text-fg"
      } ${calls && !open ? "motion-safe:animate-glow" : ""}`}
    >
      <span className="flex w-8 flex-col items-center gap-2 py-3">
        <Inbox className="size-3.5" />
        <span key={count} className="font-mono text-xs tabular-nums motion-safe:animate-tick">
          {count}
        </span>
        <span className="font-mono text-[0.625rem] uppercase tracking-[0.2em] [writing-mode:vertical-rl] rotate-180">
          Backlog
        </span>
      </span>
      <span aria-hidden="true" className="flex w-3.5 items-center justify-center">
        <span className={`h-8 w-1 rounded-full ${open ? "bg-bg/50" : "bg-dim group-hover:bg-fg"}`} />
      </span>
    </Link>
  );
}

/** The Cancelled tab, at the bottom left: a tab that pulls up. */
export function CancelledTab({ open, count }: { open: boolean; count: number }) {
  const [params] = useSearchParams();
  const to = flipped(params, "cancelled", open);
  const pull = usePull(to, open, "up");
  if (count === 0 && !open) return null;

  return (
    <Link
      to={to}
      preventScrollReset
      {...pull}
      aria-label={tabName(open, "Cancelled", count)}
      title={`${open ? "Put away" : "Pull up"} Cancelled`}
      style={{ bottom: open ? `${SHEET_VH}dvh` : 0 }}
      className={`press group fixed left-6 z-40 flex flex-col items-stretch rounded-t-xl border border-b-0 shadow-md transition-[bottom,translate] duration-300 ease-snap hover:translate-y-0 focus-visible:translate-y-0 print:hidden ${
        open ? "translate-y-0 border-fg bg-fg text-bg" : "translate-y-8 border-border bg-surface text-muted hover:text-fg"
      }`}
    >
      <span aria-hidden="true" className="flex h-3.5 items-center justify-center">
        <span className={`h-1 w-8 rounded-full ${open ? "bg-bg/50" : "bg-dim group-hover:bg-fg"}`} />
      </span>
      <span className="flex h-8 items-center gap-2 px-3">
        <CircleXMark className="size-3.5" />
        <span className="font-mono text-[0.625rem] uppercase tracking-[0.2em]">Cancelled</span>
        <span key={count} className="font-mono text-xs tabular-nums motion-safe:animate-tick">
          {count}
        </span>
      </span>
    </Link>
  );
}

/** Escape inside a drawer puts it away. A press anywhere else is the board's. See ADR-0022. */
function useEscapeAway(status: SideStatus, box: React.RefObject<HTMLElement | null>) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || !box.current?.contains(event.target as Node)) return;
      if ((event.target as HTMLElement).closest("input, textarea")) return;
      event.stopPropagation();
      navigate(flipped(params, status, true), { preventScrollReset: true });
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [status, params, navigate, box]);
}

/**
 * The Backlog drawer, over the board's left edge. Its column keeps the board's
 * own markup; the drawer gives it a fixed width and its own pad.
 */
export function BacklogDrawer({ open, children }: { open: boolean; children: React.ReactNode }) {
  const box = useRef<HTMLElement>(null);
  useEscapeAway("backlog", box);
  if (!open) return null;

  return (
    <aside
      ref={box}
      aria-label="Backlog"
      style={{ width: `${DRAWER_REM}rem` }}
      className="fixed inset-y-0 left-0 z-30 flex max-w-[90vw] overflow-y-auto overscroll-contain border-r border-border bg-bg shadow-2xl motion-safe:animate-slide-in print:hidden [&>section]:w-full [&>section]:min-w-0 [&>section]:flex-none [&>section]:px-4! [&>section]:animate-none!"
    >
      {children}
    </aside>
  );
}

/**
 * The Cancelled sheet, raised from the foot of the screen. Its cards lie in a
 * grid across the sheet's width, so a short sheet holds many.
 */
export function CancelledSheet({ open, children }: { open: boolean; children: React.ReactNode }) {
  const box = useRef<HTMLElement>(null);
  useEscapeAway("cancelled", box);
  if (!open) return null;

  return (
    <aside
      ref={box}
      aria-label="Cancelled"
      style={{ height: `${SHEET_VH}dvh` }}
      className="fixed inset-x-0 bottom-0 z-30 flex overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-bg shadow-2xl motion-safe:animate-sheet-up print:hidden [&>section]:w-full [&>section]:min-w-0 [&>section]:flex-none [&>section]:px-6! [&>section]:animate-none! [&_ul]:grid! [&_ul]:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] [&_ul]:content-start"
    >
      {children}
    </aside>
  );
}

/** The ✕ in a drawer column's head, which puts that column away. */
export function PutAway({ status, label }: { status: SideStatus; label: string }) {
  const [params] = useSearchParams();
  return (
    <Link
      to={flipped(params, status, true)}
      preventScrollReset
      aria-label={`Put ${label} away`}
      title={`Put ${label} away`}
      className="press -my-1 ml-auto flex size-8 items-center justify-center rounded-lg text-dim hover:bg-surface-2 hover:text-fg"
    >
      <XMark className="size-3.5" />
    </Link>
  );
}
