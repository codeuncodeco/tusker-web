/**
 * A page that opens over the board or view the person stands on, as a modal,
 * rather than in its place: a task, a client, the decision log, the org's
 * settings. The page behind stays drawn, dimmed, so the person never loses
 * where they were, and a page change is a sheet sliding up, not a jump. See
 * ADR-0039.
 *
 * It is a route: the address names it, a link opens it, and the browser's Back
 * closes it. Its app bar holds Back and Forward, which walk the browser's
 * history, the page's name, and ✕, which closes it onto the page behind.
 * Escape and a click on the shade close it too.
 *
 * On a phone it is a full sheet, risen from the foot of the screen; its grip
 * pulls down to close it.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useOutlet } from "react-router";

import { play } from "./sound";
import { ArrowLeft, ArrowRight, XMark } from "./icons";
import { modalParentOf } from "./paths";

/** The page names a modal's app bar reads from its address. */
const NAMES: Record<string, string> = {
  clients: "Clients",
  decisions: "Decisions",
  archive: "Archive",
  fields: "Fields",
  members: "Members",
  settings: "Settings",
};

/**
 * Names a card as the one a task opens from, for the one step of the view
 * transition: its box grows into the sheet's. The sheet takes the name back
 * as it mounts, so the page never holds two elements of one name. See
 * ADR-0040.
 */
export function markOpening(card: HTMLElement | null) {
  if (!card || typeof document.startViewTransition !== "function") return;
  card.style.viewTransitionName = "task";
  card.dataset.opening = "";
  // The page behind holds still while the card grows; only the card moves.
  document.documentElement.classList.add("opening-task");
}

/** Takes the name back from the card a task opened from. */
function unmarkOpening() {
  for (const card of document.querySelectorAll<HTMLElement>("[data-opening]")) {
    card.style.viewTransitionName = "";
    delete card.dataset.opening;
  }
  // The class lasts the transition, which is captured by now and runs 320ms.
  window.setTimeout(() => document.documentElement.classList.remove("opening-task"), 400);
}

/** What a modal at this address is called. */
export function modalTitle(pathname: string): string {
  if (pathname === "/account") return "Account";
  if (pathname === "/orgs/new") return "New org";
  const task = pathname.match(/\/t\/(\d+)$/);
  if (task) return `Task #${task[1]}`;
  const page = pathname.match(/\/board\/([^/]+)(?:\/([^/]+))?/);
  if (page) return page[2] ? decodeURIComponent(page[2]) : (NAMES[page[1]!] ?? "");
  return "";
}

/**
 * The child route of a board or view, drawn as a modal over it, or nothing
 * where no child is open. `closeTo` is the page behind, with its address.
 */
export function ModalOutlet({ closeTo }: { closeTo: string }) {
  const outlet = useOutlet();
  if (!outlet) return null;
  return <RouteModal closeTo={closeTo}>{outlet}</RouteModal>;
}

/** How far a pull on the grip must travel down before it closes, in px. */
const PULL = 80;

/** Whether the browser can step this way, where it says; else assume it can. */
function canStep(way: "back" | "forward"): boolean {
  const navigation = (globalThis as { navigation?: { canGoBack?: boolean; canGoForward?: boolean } }).navigation;
  if (!navigation) return true;
  return way === "back" ? navigation.canGoBack !== false : navigation.canGoForward !== false;
}

export function RouteModal({ closeTo, children }: { closeTo: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname, key } = useLocation();
  const box = useRef<HTMLDivElement>(null);
  const [pulled, setPulled] = useState(0);
  const from = useRef<number | null>(null);
  const [steps, setSteps] = useState({ back: true, forward: true });
  const title = modalTitle(pathname);
  // The page behind owns its own address: a click on the shade, ✕ and Escape
  // land there, and so does the end of a delete.
  const close = () => navigate(closeTo, { preventScrollReset: true });

  // A sheet opening and closing has a sound of its own. See `app/sound.ts`.
  useEffect(() => {
    play("open");
    return () => play("close");
  }, []);

  // The card this sheet grew from gives its name back before the new page is
  // captured. See `markOpening`.
  useLayoutEffect(unmarkOpening, [key]);

  // The page behind does not scroll while the modal is up.
  useEffect(() => {
    const root = document.documentElement;
    const was = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = was;
    };
  }, []);

  // Each page the modal shows takes the focus, so the keys start inside it.
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
    setSteps({ back: canStep("back"), forward: canStep("forward") });
  }, [key]);

  // Escape closes it, unless a box or a raised prompt inside wants the press.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [data-holds-escape]")) return;
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      event.stopPropagation();
      close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `close` reads the address it was given.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeTo]);

  const appButton =
    "press flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30";

  return (
    <div
      // A plain shade, and no blur: blurring the whole board behind a sheet
      // as it opens is what made the opening stutter. See ADR-0040.
      className="fixed inset-0 z-50 flex items-end justify-center bg-fg/30 sm:items-center sm:p-6 motion-safe:animate-fade"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Page"}
        // A page, not a prompt: a press inside it is the page's. See `isPagePress`.
        data-page
        tabIndex={-1}
        style={{
          ...(pulled ? { transform: `translateY(${pulled}px)` } : {}),
          // A task's sheet shares its name with the card it opened from, so
          // the card's box grows into it. See `CardItem` and ADR-0040.
          ...(/\/t\/\d+$/.test(pathname) ? { viewTransitionName: "task" } : {}),
        }}
        className="flex h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-bg shadow-2xl will-change-transform focus:outline-none sm:h-[min(56rem,calc(100dvh-3rem))] sm:max-w-6xl sm:rounded-3xl motion-safe:animate-sheet-up sm:motion-safe:animate-scale-in"
      >
        {/* The grip: a phone pulls it down to close the sheet. */}
        <div
          aria-hidden="true"
          className="flex h-5 shrink-0 touch-none items-center justify-center sm:hidden"
          onPointerDown={(event) => {
            from.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (from.current === null) return;
            setPulled(Math.max(0, event.clientY - from.current));
          }}
          onPointerUp={() => {
            from.current = null;
            if (pulled > PULL) close();
            else setPulled(0);
          }}
        >
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>

        <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-3 sm:px-4">
          <button type="button" onClick={() => navigate(-1)} disabled={!steps.back} aria-label="Back" title="Back" className={appButton}>
            <ArrowLeft className="size-3.5" />
          </button>
          <button type="button" onClick={() => navigate(1)} disabled={!steps.forward} aria-label="Forward" title="Forward" className={appButton}>
            <ArrowRight className="size-3.5" />
          </button>
          <span className="ml-2 min-w-0 flex-1 truncate font-medium">
            {title}
          </span>
          <button type="button" onClick={close} aria-label="Close" title="Close  Esc" className={appButton}>
            <XMark className="size-4" />
          </button>
        </header>

        {/* The page itself. A page drawn here gives up its own frame: the
            modal is its frame. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div
            key={key}
            className="contents [&>main]:mx-0 [&>main]:w-full [&>main]:max-w-none [&>main]:flex-none [&>main]:justify-start [&>main]:p-4 sm:[&>main]:p-6 motion-safe:[&>main]:animate-fade"
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The page behind a modal at this address, with the address it holds. */
export function useCloseTo(): string {
  const { pathname, search } = useLocation();
  const parent = modalParentOf(pathname) ?? pathname;
  return `${parent}${search}`;
}
