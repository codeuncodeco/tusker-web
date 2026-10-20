/**
 * The dock: three round buttons fixed to the bottom right of every signed-in
 * page, where a thumb and a pointer both find them. See ADR-0037.
 *
 * - **View** steps through the views as the colour scheme button steps
 *   through schemes: Board, Week, Plan, Focus, and round again. Shift-click
 *   steps back.
 * - **Settings** opens a panel that picks the board's org, and holds the org's
 *   own pages: Clients, Decisions, Archive, Fields, Members and its settings.
 * - **Profile** wears the person's avatar and opens the account as a modal
 *   over the page.
 *
 * Each is a link or a `<details>` underneath, so with no script each still
 * reaches its page.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useLocation, useNavigate, useSearchParams } from "react-router";

import { ACCOUNT, AccountBody, type AccountData } from "./account-body";
import { ASSIGNEE_NAME, readAssignee } from "./assignee-filter";
import type { Me } from "./assignees";
import type { OrgHeld } from "./current-org";
import { Bullseye, CalendarWeek, Columns, Gear, ListCheck, User, XMark } from "./icons";
import { Avatar } from "./initials";
import { OrgDot } from "./org-chip";
import { ColourSchemeButton, KeysButton } from "./look-buttons";
import { boardOf } from "./org-select";

/** The views the View button steps through, in order. */
export const VIEWS = ["board", "week", "plan", "focus"] as const;

export type View = (typeof VIEWS)[number];

/** What each view is called, and the glyph its button draws. */
export const VIEW_LOOK: Record<View, { label: string; icon: (className: string) => React.ReactNode }> = {
  board: { label: "Board", icon: (c) => <Columns className={c} /> },
  week: { label: "Week", icon: (c) => <CalendarWeek className={c} /> },
  plan: { label: "Plan", icon: (c) => <ListCheck className={c} /> },
  focus: { label: "Focus", icon: (c) => <Bullseye className={c} /> },
};

/** The address of each view but the board, whose address is its scope's. */
const VIEW_PATH: Record<Exclude<View, "board">, string> = {
  week: "/me/week",
  plan: "/me/plan",
  focus: "/me/focus",
};

/** The view a page is, or null for a page that is none of them: a task, a client, a setting. */
export function viewOf(pathname: string, onBoard: boolean): View | null {
  if (onBoard) return "board";
  if (pathname.startsWith("/me/week")) return "week";
  if (pathname.startsWith("/me/plan")) return "plan";
  if (pathname.startsWith("/me/focus")) return "focus";
  return null;
}

/**
 * The view one click moves to. A page that is no view steps to the board, the
 * start of the ring. `back` steps the other way.
 */
export function nextView(view: View | null, back = false): View {
  if (view === null) return "board";
  const at = VIEWS.indexOf(view);
  return VIEWS[(at + (back ? VIEWS.length - 1 : 1)) % VIEWS.length]!;
}

/** The pages of one org the settings panel holds. */
const ORG_PAGES = [
  { to: "clients", label: "Clients" },
  { to: "decisions", label: "Decisions" },
  { to: "archive", label: "Archive" },
  { to: "fields", label: "Fields" },
  { to: "members", label: "Members" },
  { to: "settings", label: "Org settings" },
] as const;

/** Where the board the person last stood on is kept: an org's slug, or empty for All. */
const SCOPE_KEY = "tusker:scope";

/**
 * The board the Board view opens: the org of the address; else the board the
 * person last stood on; else their first org, which is where Tusker starts.
 * See ADR-0037.
 */
function useBoard(orgs: OrgHeld[], org: OrgHeld | null, onBoard: boolean): string {
  const { pathname } = useLocation();
  const [kept, setKept] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (onBoard) localStorage.setItem(SCOPE_KEY, org?.slug ?? "");
      setKept(localStorage.getItem(SCOPE_KEY));
    } catch {
      // A browser that keeps nothing starts on the first org.
    }
  }, [onBoard, org?.slug, pathname]);

  if (org) return boardOf(org.slug);
  if (kept !== null && (kept === "" || orgs.some((one) => one.slug === kept))) return boardOf(kept || null);
  return boardOf(orgs[0]?.slug ?? null);
}

/** The look every dock button shares: round, raised, and pressed in a game's way. */
const DOCK_BUTTON =
  "press flex size-12 items-center justify-center rounded-full border border-border bg-surface text-fg shadow-lg hover:-translate-y-0.5 hover:border-dim hover:shadow-xl";

export function Dock({
  orgs,
  org,
  me,
  onBoard,
  raised,
  where,
}: {
  /** Where the person stands, as "Studio / Board", which the View button says. */
  where?: string;
  orgs: OrgHeld[];
  /** The org of the address, or null on a page of no one org. */
  org: OrgHeld | null;
  me?: Me;
  onBoard: boolean;
  /** True where a bar is fixed to the foot of the page, as on a task page on a phone. */
  raised: boolean;
}) {
  const board = useBoard(orgs, org, onBoard);

  return (
    <nav
      aria-label="Dock"
      className={`fixed right-4 z-30 flex items-end gap-2 sm:right-6 ${raised ? "bottom-20 sm:bottom-6" : "bottom-4 sm:bottom-6"} print:hidden`}
    >
      <ViewButton board={board} onBoard={onBoard} where={where} />
      <SettingsPanel orgs={orgs} org={org} />
      <Profile me={me} />
    </nav>
  );
}

/**
 * The View button: one glyph, and one click steps to the next view. The name of
 * the view stands beside the glyph while the pointer is over it.
 */
function ViewButton({ board, onBoard, where }: { board: string; onBoard: boolean; where?: string }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const view = viewOf(pathname, onBoard);
  const next = nextView(view);
  const back = nextView(view, true);
  const to = (one: View) => (one === "board" ? board : VIEW_PATH[one]);
  const shown = view ?? "board";
  const name = view
    ? `View: ${VIEW_LOOK[view].label}. Switch to ${VIEW_LOOK[next].label}.`
    : `Back to ${VIEW_LOOK[next].label}`;

  return (
    <Link
      to={to(next)}
      aria-label={name}
      title={`${where ? `${where}. ` : ""}${name} Shift-click steps back.`}
      onClick={(event) => {
        if (!event.shiftKey) return;
        event.preventDefault();
        navigate(to(back));
      }}
      className={`group ${DOCK_BUTTON} w-auto min-w-12 gap-0 px-3.5 hover:gap-2`}
    >
      <span key={shown} className="flex motion-safe:animate-spin-in">
        {VIEW_LOOK[shown].icon("size-5")}
      </span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap font-medium transition-[max-width] duration-300 ease-snap group-hover:max-w-24 group-focus-visible:max-w-24">
        {view ? VIEW_LOOK[view].label : "Board"}
        <span className="text-muted"> → {VIEW_LOOK[next].label}</span>
      </span>
    </Link>
  );
}

/**
 * Where a pick of an org lands: its board, or `/go` with the assignee filter
 * the board holds, so the next board reads it in its own words. See ADR-0033.
 */
function usePicked(): (slug: string) => string {
  const [params] = useSearchParams();
  const assignee = params.has(ASSIGNEE_NAME) ? readAssignee(params) : null;
  return (slug) =>
    assignee === null ? boardOf(slug || null) : `/go?${new URLSearchParams({ to: slug, [ASSIGNEE_NAME]: assignee })}`;
}

/**
 * The settings panel: the gear, and above it the board's org, every other org
 * and All, then the pages of the org in view. A `<details>`, so it opens with
 * no script; script closes it on a pick, a click outside, and Escape.
 */
function SettingsPanel({ orgs, org }: { orgs: OrgHeld[]; org: OrgHeld | null }) {
  const panel = useRef<HTMLDetailsElement>(null);
  const { pathname } = useLocation();
  const picked = usePicked();
  // The org whose pages the panel holds: the one in view, else the first.
  const pages = org ?? orgs[0] ?? null;
  const onAll = pathname === "/me";

  useEffect(() => {
    const close = () => {
      if (panel.current) panel.current.open = false;
    };
    const onPointerDown = (event: PointerEvent) => {
      const it = panel.current;
      if (it?.open && event.target instanceof Node && !it.contains(event.target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !panel.current?.open) return;
      // One press means one thing. See ADR-0022.
      event.stopPropagation();
      close();
      panel.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // A page change closes it.
  useEffect(() => {
    if (panel.current) panel.current.open = false;
  }, [pathname]);

  const row = (here: boolean) =>
    `press flex items-center gap-2 rounded-lg px-3 py-2 ${here ? "bg-fg font-medium text-bg" : "text-muted hover:bg-surface-2 hover:text-fg"}`;

  return (
    <details ref={panel} className="group/settings relative">
      <summary aria-label="Settings" title="Settings" className={`${DOCK_BUTTON} list-none [&::-webkit-details-marker]:hidden`}>
        <Gear className="size-5 transition-transform duration-300 ease-spring group-open/settings:rotate-90" />
      </summary>
      <div className="absolute bottom-full right-0 mb-3 flex w-72 flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-2xl motion-safe:animate-rise-in">
        {/* How the page is drawn: the colour scheme, one click a step, and
            the Key guide where the page gives list keys. */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs uppercase tracking-wide text-muted">Look</span>
          <span className="ml-auto flex items-center gap-2">
            <KeysButton />
            <ColourSchemeButton />
          </span>
        </div>
        {orgs.length > 0 ? (
          <section className="flex flex-col gap-1">
            <h2 className="px-3 pt-1 text-xs uppercase tracking-wide text-muted">Board</h2>
            {orgs.map((one) => {
              const here = org?.slug === one.slug && !onAll;
              return (
                <Link key={one.slug} to={picked(one.slug)} aria-current={here ? "page" : undefined} className={row(here)}>
                  <OrgDot color={one.color} />
                  <span className="truncate">{one.name}</span>
                </Link>
              );
            })}
            {orgs.length > 1 ? (
              <Link to={picked("")} aria-current={onAll ? "page" : undefined} className={row(onAll)}>
                <span aria-hidden="true" className="flex -space-x-1">
                  {orgs.slice(0, 3).map((one) => (
                    <OrgDot key={one.slug} color={one.color} />
                  ))}
                </span>
                All orgs
              </Link>
            ) : null}
          </section>
        ) : null}

        {pages ? (
          <section className="flex flex-col gap-1 border-t border-border pt-3">
            <h2 className="flex items-center gap-1.5 px-3 text-xs uppercase tracking-wide text-muted">
              <OrgDot color={pages.color} />
              {pages.name}
            </h2>
            <div className="grid grid-cols-2 gap-1">
              {ORG_PAGES.map((page) => {
                const to = `/o/${pages.slug}/${page.to}`;
                const here = pathname.startsWith(to);
                return (
                  <Link key={page.to} to={to} aria-current={here ? "page" : undefined} className={row(here)}>
                    {page.label}
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        <Link to="/orgs/new" className={`${row(pathname === "/orgs/new")} border-t border-border`}>
          New org
        </Link>
      </div>
    </details>
  );
}

/**
 * The profile button: the person's avatar. A click opens the account as a
 * modal over the page; a link underneath, so a modified click or no script
 * opens the account page itself.
 */
function Profile({ me }: { me?: Me }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLAnchorElement>(null);
  const { pathname } = useLocation();

  // A page change, from a link in the modal, closes it.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <Link
        ref={button}
        to={ACCOUNT}
        aria-haspopup="dialog"
        aria-label={me?.name ? `Account: ${me.name}` : "Account"}
        title="Account"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          setOpen(true);
        }}
        className={`${DOCK_BUTTON} overflow-hidden p-0`}
      >
        {me ? <Avatar person={me} size="md" className="size-10 border-2 text-xs" /> : <User className="size-5" />}
      </Link>
      {open ? (
        <AccountModal
          onClose={() => {
            setOpen(false);
            button.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The account, as a modal: the same block the account page draws, loaded when
 * the modal opens. Escape, the ✕ and a click on the shade close it. It is drawn
 * only while open, because a dialog on the page stops the list keys. See
 * `isPagePress`.
 */
function AccountModal({ onClose }: { onClose: () => void }) {
  const account = useFetcher<AccountData>();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (account.state === "idle" && !account.data) void account.load(ACCOUNT);
    box.current?.focus();
    // Once, as the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // One press means one thing: a box inside the modal reads Escape first.
      if ((event.target as HTMLElement | null)?.closest("input, textarea")) return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-fg/25 p-4 backdrop-blur-[2px] sm:items-center motion-safe:animate-fade-in"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label="Your account"
        tabIndex={-1}
        className="relative max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-bg p-6 shadow-2xl focus:outline-none motion-safe:animate-pop"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="press absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
        >
          <XMark className="size-4" />
        </button>
        {account.data ? (
          <AccountBody {...account.data} />
        ) : (
          <div className="flex items-center gap-4" aria-busy="true">
            <span className="size-20 animate-pulse rounded-full bg-surface-2" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="h-7 w-48 animate-pulse rounded bg-surface-2" />
              <span className="h-4 w-32 animate-pulse rounded bg-surface-2" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
