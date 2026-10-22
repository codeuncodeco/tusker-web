/**
 * A page that opens over the board or view the person stands on, as a modal,
 * rather than in its place: a task, a client, the decision log, the org's
 * settings. The page behind stays drawn, dimmed, so the person never loses
 * where they were, and a page change is a sheet sliding up, not a jump. See
 * ADR-0039.
 *
 * It is a route: the address names it, a link opens it, and the browser's Back
 * closes it. It draws no bar of its own: the page puts `ModalControls`, Back,
 * Forward and ✕, in its head tile, so the controls are part of the bento. A
 * page that holds none still gets a lone ✕ at the modal's top right. Escape
 * and a click on the shade close it too. See ADR-0040.
 *
 * On a phone it is a full sheet, risen from the foot of the screen; its grip
 * pulls down to close it.
 */

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useOutlet } from "react-router";

import { play } from "./sound";
import { ArrowLeft, ArrowRight, XMark } from "./icons";
import { modalParentOf } from "./paths";

/** The page names a modal reads from its address, for a screen reader. */
const NAMES: Record<string, string> = {
  clients: "Clients",
  decisions: "Decisions",
  archive: "Archive",
  fields: "Fields",
  members: "Members",
  settings: "Settings",
};

/** How long a card takes to grow into its task, or the task to shrink back, in ms. Matches `app.css`. */
const MORPH_MS = 380;

/**
 * The card the open task grew from, while it is still on the page. Closing
 * the task shrinks the sheet back into it. See ADR-0040.
 */
let openedFrom: HTMLElement | null = null;

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
  openedFrom = card;
  // The page behind holds still while the card grows; only the card moves,
  // and the shade fades in over it.
  document.documentElement.classList.add("opening-task");
}

/** Takes the name back from the card a task opened from. */
function unmarkOpening() {
  for (const card of document.querySelectorAll<HTMLElement>("[data-opening]")) {
    card.style.viewTransitionName = "";
    delete card.dataset.opening;
  }
  // The class lasts the transition, which is captured by now.
  window.setTimeout(() => document.documentElement.classList.remove("opening-task"), MORPH_MS + 80);
}

/**
 * Readies a task's close to run the open in reverse: the sheet shrinks back
 * into the card it grew from, while the shade fades out. It holds only where
 * that card is still on the page and the browser draws view transitions;
 * else the close is a plain one. True when it is readied.
 */
function readyClosing(): boolean {
  if (typeof document.startViewTransition !== "function") return false;
  if (!openedFrom?.isConnected) return false;
  document.documentElement.classList.add("closing-task");
  return true;
}

/**
 * Hands the name `task` to the card the sheet grew from. It runs as the sheet
 * unmounts, inside the transition's update, so the new page has the card
 * named where the old one had the sheet.
 */
function landClosing() {
  const card = openedFrom;
  if (!card?.isConnected || !document.documentElement.classList.contains("closing-task")) return;
  card.style.viewTransitionName = "task";
  window.setTimeout(() => {
    card.style.viewTransitionName = "";
    document.documentElement.classList.remove("closing-task");
  }, MORPH_MS + 80);
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

/** What a page inside a modal needs to draw its controls: where ✕ goes, and each step. */
type ModalNav = {
  closeTo: string;
  close: () => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
};

const ModalNavContext = createContext<ModalNav | null>(null);

/** The modal this page is drawn in, or null for a page drawn on its own. */
export function useModalNav(): ModalNav | null {
  return useContext(ModalNavContext);
}

/** The look of one modal control: round, 32px, no surface until hovered. */
const CONTROL =
  "press flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent";

/**
 * Back, Forward and ✕, as one compact cluster for a page's head tile. Back
 * and Forward walk the browser's history; ✕ closes onto the page behind, and
 * is a link, so it works with no script. Outside a modal it draws nothing.
 * The modal sees it is here, by its `data-modal-controls`, and drops its own
 * lone ✕. See ADR-0040.
 */
export function ModalControls({ className = "" }: { className?: string }) {
  const nav = useModalNav();
  if (!nav) return null;
  return (
    <span data-modal-controls className={`flex shrink-0 items-center gap-0.5 ${className}`}>
      <button type="button" onClick={nav.back} disabled={!nav.canBack} aria-label="Back" title="Back" className={CONTROL}>
        <ArrowLeft className="size-3.5" />
      </button>
      <button type="button" onClick={nav.forward} disabled={!nav.canForward} aria-label="Forward" title="Forward" className={CONTROL}>
        <ArrowRight className="size-3.5" />
      </button>
      <Link
        to={nav.closeTo}
        preventScrollReset
        onClick={(event) => {
          event.preventDefault();
          nav.close();
        }}
        aria-label="Close"
        title="Close  Esc"
        className={CONTROL}
      >
        <XMark className="size-4" />
      </Link>
    </span>
  );
}

export function RouteModal({ closeTo, children }: { closeTo: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname, key } = useLocation();
  const box = useRef<HTMLDivElement>(null);
  const [pulled, setPulled] = useState(0);
  const from = useRef<number | null>(null);
  const [steps, setSteps] = useState({ back: true, forward: true });
  const title = modalTitle(pathname);
  const isTask = /\/t\/\d+$/.test(pathname);
  // A sheet that grows out of a card leaves the moving to the card: its own
  // entry would run inside the morph and shake it. Read once, as it mounts.
  const [grown] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("opening-task"),
  );
  // The task the sheet grew into: only that task shrinks back into the card.
  // A step to another task inside the sheet closes it plainly.
  const grewAt = useRef(grown ? pathname : null);
  // The page behind owns its own address: a click on the shade, ✕ and Escape
  // land there, and so does the end of a delete. A task shrinks back into the
  // card it grew from, where that card is still on the page.
  const close = () =>
    navigate(closeTo, {
      preventScrollReset: true,
      viewTransition: isTask && grewAt.current === pathname && readyClosing(),
    });

  // A sheet opening and closing has a sound of its own. See `app/sound.ts`.
  useEffect(() => {
    play("open");
    return () => play("close");
  }, []);

  // The card this sheet grew from gives its name back before the new page is
  // captured. See `markOpening`.
  useLayoutEffect(unmarkOpening, [key]);

  // As the sheet goes, the card it grew from takes the name back, so the
  // close runs the open in reverse. See `readyClosing`.
  useLayoutEffect(() => landClosing, []);

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
    // `close` reads the address it was given, and the task it is on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeTo, pathname]);

  const nav: ModalNav = {
    closeTo,
    close,
    back: () => void navigate(-1),
    forward: () => void navigate(1),
    canBack: steps.back,
    canForward: steps.forward,
  };

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
          ...(isTask ? { viewTransitionName: "task" } : {}),
        }}
        className={`group/modal relative flex h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-bg shadow-2xl will-change-transform focus:outline-none sm:h-[min(56rem,calc(100dvh-3rem))] sm:max-w-6xl sm:rounded-3xl ${grown ? "" : "motion-safe:animate-sheet-up sm:motion-safe:animate-scale-in"}`}
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

        {/* No bar: the page's head tile holds the controls. A page that
            holds none gets this lone ✕, which hides as soon as the page's
            own controls are in the dialog. */}
        <Link
          to={closeTo}
          preventScrollReset
          onClick={(event) => {
            event.preventDefault();
            close();
          }}
          aria-label="Close"
          title="Close  Esc"
          className="press absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-sm hover:text-fg group-has-[[data-modal-controls]]/modal:hidden max-sm:top-6"
        >
          <XMark className="size-4" />
        </Link>

        {/* The page itself. A page drawn here gives up its own frame: the
            modal is its frame. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div
            key={key}
            className="contents [&>main]:mx-0 [&>main]:w-full [&>main]:max-w-none [&>main]:flex-none [&>main]:justify-start [&>main]:p-4 sm:[&>main]:px-6 sm:[&>main]:pb-6 sm:[&>main]:pt-4 motion-safe:[&>main]:animate-fade"
          >
            <ModalNavContext.Provider value={nav}>{children}</ModalNavContext.Provider>
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
