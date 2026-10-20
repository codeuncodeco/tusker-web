/**
 * Backlog and Cancelled, kept off the board: two tabs at the left edge of the
 * screen, mostly out of sight, and a drawer that slides out over the board
 * when one is pulled. The board's width goes to the work in hand. See
 * ADR-0038.
 *
 * A tab is a link that flips `backlog=1` or `cancelled=1`, as the switches
 * did, so an open drawer is an address and the loader reads its cards. A
 * click opens it, and so does a pull: press on the tab and drag it out. While
 * a drawer is open the tabs ride on its right edge, as handles, and a click
 * on an open one, the ✕, or Escape inside the drawer puts it away.
 *
 * The drawer is drawn inside the board's drag context, so a card drags from
 * it onto the board and back.
 */

import { useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { flipped, type Status } from "./board";
import { CircleXMark, Inbox, XMark } from "./icons";

/** The columns that live in the drawer, in the order their tabs stand. */
export const SIDE_STATUSES = ["backlog", "cancelled"] as const satisfies readonly Status[];

export type SideStatus = (typeof SIDE_STATUSES)[number];

/** True for a column the drawer holds rather than the board. */
export function isSide(status: Status): status is SideStatus {
  return (SIDE_STATUSES as readonly Status[]).includes(status);
}

/** How wide one column of the drawer is, in rem. */
const COLUMN_REM = 20;

/** How far a pull must travel before it opens the drawer, in px. */
const PULL = 24;

const TAB_LOOK: Record<SideStatus, { label: string; icon: React.ReactNode }> = {
  backlog: { label: "Backlog", icon: <Inbox className="size-3.5" /> },
  cancelled: { label: "Cancelled", icon: <CircleXMark className="size-3.5" /> },
};

/**
 * The two tabs. `open` says which drawers are out; `counts` what each holds.
 * `calls` marks a tab that wants a look: Backlog on an org board with nothing
 * live, which the org board used to open by rule.
 */
export function PullTabs({
  open,
  counts,
  calls = [],
}: {
  open: SideStatus[];
  counts: Record<SideStatus, number>;
  calls?: SideStatus[];
}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const from = useRef<number | null>(null);

  return (
    <div
      style={{ left: `${open.length * COLUMN_REM}rem` }}
      className="fixed top-20 z-40 flex flex-col gap-2 transition-[left] duration-300 ease-snap print:hidden"
    >
      {SIDE_STATUSES.map((status) => {
        const out = open.includes(status);
        const to = flipped(params, status, out);
        const look = TAB_LOOK[status];
        const count = counts[status];
        return (
          <Link
            key={status}
            to={to}
            preventScrollReset
            aria-label={`${out ? "Put away" : "Pull out"} ${look.label}, ${count} ${count === 1 ? "task" : "tasks"}`}
            title={`${out ? "Put away" : "Pull out"} ${look.label}`}
            onPointerDown={(event) => {
              from.current = event.clientX;
            }}
            onPointerMove={(event) => {
              if (from.current === null || out) return;
              if (event.clientX - from.current > PULL) {
                from.current = null;
                navigate(to, { preventScrollReset: true });
              }
            }}
            onPointerUp={() => {
              from.current = null;
            }}
            onPointerLeave={() => {
              from.current = null;
            }}
            // Shut, the tab hides behind the screen's edge but for its grip;
            // the pointer over it slides it out to read. Open, it is the
            // drawer's handle, in full.
            className={`press group flex items-stretch rounded-r-xl border border-l-0 shadow-md transition-transform duration-300 ease-snap hover:translate-x-0 focus-visible:translate-x-0 ${
              out ? "translate-x-0 border-fg bg-fg text-bg" : "-translate-x-8 border-border bg-surface text-muted hover:text-fg"
            } ${calls.includes(status) && !out ? "motion-safe:animate-glow" : ""}`}
          >
            <span className="flex w-8 flex-col items-center gap-2 py-3">
              {look.icon}
              <span key={count} className="font-mono text-xs tabular-nums motion-safe:animate-tick">
                {count}
              </span>
              <span className="font-mono text-[0.625rem] uppercase tracking-[0.2em] [writing-mode:vertical-rl] rotate-180">
                {look.label}
              </span>
            </span>
            {/* The grip: what shows at the edge while the tab is shut, and
                what a person pulls. */}
            <span aria-hidden="true" className="flex w-3.5 items-center justify-center">
              <span className={`h-8 w-1 rounded-full ${out ? "bg-bg/50" : "bg-dim group-hover:bg-fg"}`} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * The drawer itself: the open columns side by side, over the board's left
 * edge, with a shadow so the board reads as behind it.
 */
export function SideDrawer({ open, children }: { open: SideStatus[]; children: React.ReactNode }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const drawer = useRef<HTMLElement>(null);

  // Escape inside the drawer puts it away. A press anywhere else is the
  // board's: one press means one thing. See ADR-0022.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || !drawer.current?.contains(event.target as Node)) return;
      if ((event.target as HTMLElement).closest("input, textarea")) return;
      event.stopPropagation();
      let next = params;
      for (const status of open) next = new URLSearchParams(flipped(next, status, true).slice(1));
      navigate(`?${next}`, { preventScrollReset: true });
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, params, navigate]);

  if (open.length === 0) return null;

  return (
    <aside
      ref={drawer}
      aria-label="Backlog and Cancelled"
      style={{ width: `${open.length * COLUMN_REM}rem` }}
      // A column drawn here keeps the board's own markup; the drawer gives it
      // a fixed width and its own pad, and no rise of its own, as the drawer
      // slides in whole.
      className="fixed inset-y-0 left-0 z-30 flex max-w-[90vw] divide-x divide-border overflow-y-auto border-r border-border bg-bg shadow-2xl motion-safe:animate-slide-in print:hidden [&>section]:w-80 [&>section]:min-w-0 [&>section]:flex-none [&>section]:px-4! [&>section]:animate-none!"
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
      className="press -my-1 ml-auto flex size-7 items-center justify-center rounded text-dim hover:bg-surface-2 hover:text-fg"
    >
      <XMark className="size-3.5" />
    </Link>
  );
}
