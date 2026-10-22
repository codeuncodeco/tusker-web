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
import { Form, Link, useLocation, useNavigate, useSearchParams } from "react-router";

import { ACCOUNT, Identity } from "./account-body";
import { ASSIGNEE_NAME, readAssignee } from "./assignee-filter";
import type { Me } from "./assignees";
import type { OrgHeld } from "./current-org";
import {
  ArrowRight,
  VolumeHigh,
  VolumeXmark,
  BoxArchive,
  Building,
  Bullseye,
  CalendarWeek,
  Check,
  ChevronRight,
  Columns,
  Folder,
  Gear,
  LayerGroup,
  ListCheck,
  Plus,
  RotateLeft,
  Scale,
  Sun,
  TableList,
  User,
  Users,
  XMark,
} from "./icons";
import { Avatar } from "./initials";
import { OrgDot } from "./org-chip";
import { KeysButton, SchemeSegments } from "./look-buttons";
import { boardOf } from "./org-select";
import { play, setMuted, useSoundOn } from "./sound";

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
export const ORG_PAGES = [
  { to: "clients", label: "Clients", icon: (c: string) => <Folder className={c} /> },
  { to: "decisions", label: "Decisions", icon: (c: string) => <Scale className={c} /> },
  { to: "archive", label: "Archive", icon: (c: string) => <BoxArchive className={c} /> },
  { to: "fields", label: "Fields", icon: (c: string) => <TableList className={c} /> },
  { to: "members", label: "Members", icon: (c: string) => <Users className={c} /> },
  { to: "settings", label: "Settings", icon: (c: string) => <Gear className={c} /> },
] as const;

/**
 * Where one page of an org opens: over its board, as a modal, so the board
 * stays behind it. See ADR-0039.
 */
export function orgPagePath(slug: string, page: string): string {
  return `/o/${slug}/board/${page}`;
}

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
      className={`fixed right-4 z-40 flex items-end gap-2 sm:right-6 ${raised ? "bottom-20 sm:bottom-6" : "bottom-4 sm:bottom-6"} print:hidden`}
    >
      <ViewButton board={board} onBoard={onBoard} where={where} />
      <YouPanel orgs={orgs} org={org} me={me} />
    </nav>
  );
}

/**
 * How far the dial's pills sit from the button's centre, in px: close, so a
 * pill is a short reach from the button it flew out of. See ADR-0040.
 */
const DIAL_RADIUS = 84;

/** How far round the dial runs, in radians: a third of a turn. */
const DIAL_SWEEP = (Math.PI * 2) / 3;

/**
 * Where one pill of the dial sits, from the button's centre: on an arc from
 * the button's left (the first view) round past straight above it (the
 * last). The arc is a third of a turn, wider than a quarter, so the pills
 * keep a gap between them at the short radius.
 */
export function onDial(at: number, of: number): { x: number; y: number } {
  const turn = Math.PI + (of > 1 ? (at / (of - 1)) * DIAL_SWEEP : 0);
  return { x: Math.round(Math.cos(turn) * DIAL_RADIUS), y: Math.round(Math.sin(turn) * DIAL_RADIUS) };
}

/**
 * Whether the view fan is out. It is kept outside the button, because a step
 * to Week or Plan draws another layout and so another dock, and the fan the
 * person opened must still be out when it lands.
 */
let fanOut = false;

/**
 * The View button and its fan. See ADR-0039.
 *
 * The pointer over it, or a first tap on a phone, unfurls every view as a pill
 * above it, the one in view filled. A pill goes straight to its view. The
 * centre still steps to the next view, one click a step, and the fan stays
 * out while it does, so the filled pill walks as the view changes. Shift-click
 * steps back. The pointer leaving, a tap outside, or Escape furls it.
 */
function ViewButton({ board, onBoard, where }: { board: string; onBoard: boolean; where?: string }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpenState] = useState(fanOut);
  const touch = useRef(false);
  const leave = useRef<number | undefined>(undefined);
  const box = useRef<HTMLDivElement>(null);
  const view = viewOf(pathname, onBoard);
  const next = nextView(view);
  const back = nextView(view, true);
  const to = (one: View) => (one === "board" ? board : VIEW_PATH[one]);
  const shown = view ?? "board";
  const name = view
    ? `View: ${VIEW_LOOK[view].label}. Switch to ${VIEW_LOOK[next].label}.`
    : `Back to ${VIEW_LOOK[next].label}`;

  function setOpen(value: boolean) {
    if (value !== fanOut) play(value ? "open" : "close");
    fanOut = value;
    setOpenState(value);
  }

  // A tap outside, or Escape, furls it.
  useEffect(() => {
    if (!open) return;
    function onDown(event: PointerEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={box}
      className="relative"
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        window.clearTimeout(leave.current);
        setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        leave.current = window.setTimeout(() => setOpen(false), 260);
      }}
    >
      {open ? (
        // The dial: every view on a quarter arc round the button, from its
        // left to straight above it, each flying out from the centre to its
        // place. See ADR-0040.
        <ul aria-label="Views" className="pointer-events-none absolute left-1/2 top-1/2 size-0">
          {VIEWS.map((one, at) => {
            const here = one === view;
            const { x, y } = onDial(at, VIEWS.length);
            const place = { "--ox": `${x}px`, "--oy": `${y}px` } as React.CSSProperties;
            return (
              <li
                key={one}
                style={{
                  ...place,
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                  animationDelay: `${at * 30}ms`,
                }}
                className="pointer-events-auto absolute left-0 top-0 motion-safe:animate-orbit-in"
              >
                <Link
                  to={to(one)}
                  viewTransition
                  aria-current={here ? "page" : undefined}
                  // A pick on a phone is the end of it: the dial furls. The
                  // pointer over it on a wide screen keeps it out.
                  onPointerDown={(event) => {
                    touch.current = event.pointerType !== "mouse";
                  }}
                  onClick={() => {
                    if (touch.current) setOpen(false);
                  }}
                  className={`press flex size-12 flex-col items-center justify-center gap-0.5 rounded-full border shadow-lg ${
                    here
                      ? "border-fg bg-fg text-bg ring-2 ring-fg ring-offset-2 ring-offset-bg"
                      : "border-border bg-surface text-muted hover:scale-105 hover:border-dim hover:text-fg"
                  }`}
                >
                  {VIEW_LOOK[one].icon("size-3.5")}
                  <span className="font-mono text-[0.5rem] uppercase tracking-wider">{VIEW_LOOK[one].label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      <Link
        to={to(next)}
        viewTransition
        aria-label={name}
        aria-expanded={open}
        title={`${where ? `${where}. ` : ""}${name} Shift-click steps back.`}
        onPointerDown={(event) => {
          touch.current = event.pointerType !== "mouse";
        }}
        onClick={(event) => {
          // A first tap on a phone unfurls the fan; the next steps.
          if (touch.current && !open) {
            event.preventDefault();
            setOpen(true);
            return;
          }
          if (!event.shiftKey) return;
          event.preventDefault();
          navigate(to(back), { viewTransition: true });
        }}
        className={`${DOCK_BUTTON} ${open ? "border-fg" : ""}`}
      >
        <span className={`flex transition-transform duration-300 ease-out ${open ? "rotate-90" : ""}`}>
          <span key={shown} className="flex motion-safe:animate-spin-in">
            {VIEW_LOOK[shown].icon("size-5")}
          </span>
        </span>
      </Link>
    </div>
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

/** The tabs of the You panel, in order: one section each. See ADR-0040. */
export const YOU_TABS = [
  { key: "you", label: "You" },
  { key: "boards", label: "Boards" },
  { key: "org", label: "Org" },
  { key: "look", label: "Look" },
] as const;

type YouTab = (typeof YOU_TABS)[number]["key"];

/**
 * The tab the You panel last showed. It is kept outside the panel, as the
 * view dial's `fanOut` is, because a step to another view draws another
 * layout and so another dock, and the panel must open where it was left.
 */
let lastTab: YouTab = "you";

/**
 * The You panel: the one dock button that is you and your settings, merged.
 * It wears your avatar, with a small gear at its edge, and opens a small card
 * of fixed size with four tabs: You, Boards, Org and Look. One section shows
 * at a time, and a tab switch only swaps it, so the card never jumps. Rows a
 * thumb can hit, a glyph on every row.
 *
 * A `<details>`, so it opens with no script; then every section is drawn,
 * stacked, because only script hides the ones not picked. Script closes it on
 * a pick, a click outside, and Escape. See ADR-0040.
 */
function YouPanel({ orgs, org, me }: { orgs: OrgHeld[]; org: OrgHeld | null; me?: Me }) {
  const panel = useRef<HTMLDetailsElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const picked = usePicked();
  // The org whose pages the panel holds: the one in view, else the first.
  const pages = org ?? orgs[0] ?? null;
  const onAll = pathname === "/me" || pathname.startsWith("/me/t/");
  const [extras, setExtras] = useState<{ label: string; run: () => void }[]>([]);
  const [tab, setTabState] = useState<YouTab>(lastTab);
  // Until script runs, every section stands, so the panel works with none.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setExtras(window.tuskerExtras ?? []);
    setHydrated(true);
  }, []);

  function setTab(next: YouTab) {
    if (next !== tab) play("pick");
    lastTab = next;
    setTabState(next);
  }

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
      if ((event.target as HTMLElement | null)?.closest("input, textarea")) return;
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

  /** ← and → walk the tabs while the bar has the focus. */
  function onBarKey(event: React.KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const at = YOU_TABS.findIndex((one) => one.key === tab);
    const step = event.key === "ArrowRight" ? 1 : YOU_TABS.length - 1;
    const next = YOU_TABS[(at + step) % YOU_TABS.length]!.key;
    setTab(next);
    bar.current?.querySelector<HTMLElement>(`#you-tab-${next}`)?.focus();
  }

  /** One row: a glyph in a tile, the words, and where it leads. */
  const row = (here: boolean) =>
    `press flex h-11 items-center gap-3 rounded-xl px-2 ${here ? "bg-fg text-bg" : "hover:bg-surface-2"}`;
  const tile = (here: boolean) =>
    `flex size-8 shrink-0 items-center justify-center rounded-lg ${here ? "bg-bg/15" : "bg-surface-2 text-muted"}`;

  /** The glyph each tab wears over its name. */
  const glyph: Record<YouTab, React.ReactNode> = {
    you: me ? <Avatar person={me} size="sm" className="size-5! border text-[0.4375rem]!" /> : <User className="size-4" />,
    boards: <LayerGroup className="size-4" />,
    org: <Building className="size-4" />,
    look: <Sun className="size-4" />,
  };

  /** One section, drawn while its tab is picked, or always before script runs. */
  const section = (key: YouTab, className: string, children: React.ReactNode) =>
    hydrated && key !== tab ? null : (
      <section
        key={key}
        id={`you-panel-${key}`}
        role="tabpanel"
        aria-labelledby={`you-tab-${key}`}
        className={`${className} ${hydrated ? "motion-safe:animate-fade" : ""}`}
      >
        {children}
      </section>
    );

  return (
    <details ref={panel} className="group/you relative" onToggle={(event) => play(event.currentTarget.open ? "open" : "close")}>
      <summary
        aria-label={me?.name ? `You: ${me.name}, and settings` : "You and settings"}
        title="You and settings"
        className={`${DOCK_BUTTON} relative list-none p-0 group-open/you:ring-2 group-open/you:ring-fg group-open/you:ring-offset-2 group-open/you:ring-offset-bg [&::-webkit-details-marker]:hidden`}
      >
        {me ? <Avatar person={me} size="md" className="size-10 border-2 text-xs" /> : <User className="size-5" />}
        <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border border-border bg-surface text-muted">
          <Gear className="size-2.5 transition-transform duration-300 ease-out group-open/you:rotate-90" />
        </span>
      </summary>
      {/* A card of one size over the button on a wide screen, from its
          corner; on a phone, a sheet of the same height across the foot of
          the screen, over the dock. */}
      <div className="fixed inset-x-3 bottom-20 flex h-[24rem] max-h-[calc(100dvh-7rem)] origin-bottom-right flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl motion-safe:animate-scale-in sm:absolute sm:inset-x-auto sm:bottom-full sm:right-0 sm:mb-3 sm:w-[22rem]">
        {/* The tabs: a segmented control, a glyph over each name. */}
        <div
          ref={bar}
          role="tablist"
          aria-label="You and settings"
          onKeyDown={onBarKey}
          className="m-2 grid shrink-0 grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1"
        >
          {YOU_TABS.map((one) => {
            const here = one.key === tab;
            return (
              <button
                key={one.key}
                id={`you-tab-${one.key}`}
                type="button"
                role="tab"
                aria-selected={here}
                aria-controls={`you-panel-${one.key}`}
                tabIndex={here ? 0 : -1}
                onClick={() => setTab(one.key)}
                className={`press flex h-12 flex-col items-center justify-center gap-1 rounded-lg ${
                  here ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
                }`}
              >
                {glyph[one.key]}
                <span className="text-[0.625rem] leading-none">{one.label}</span>
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {section(
            "you",
            "flex flex-col gap-0.5 px-2 pb-2",
            <>
              {me ? (
                <div className="px-1 pb-2 pt-1">
                  <Identity me={me} />
                </div>
              ) : null}
              <Link to="/account" className={row(pathname === "/account")}>
                <span className={tile(pathname === "/account")}>
                  <User className="size-3.5" />
                </span>
                <span className="flex-1">Account</span>
                <ChevronRight className="size-3 text-dim" />
              </Link>
              {extras.map((extra) => (
                <button key={extra.label} type="button" onClick={extra.run} className={`${row(false)} text-left`}>
                  <span className={tile(false)}>
                    <RotateLeft className="size-3.5" />
                  </span>
                  <span className="flex-1">{extra.label}</span>
                </button>
              ))}
              <Form method="post" action={ACCOUNT}>
                <button className={`${row(false)} w-full text-left text-danger`}>
                  <span className={`${tile(false)} text-danger`}>
                    <ArrowRight className="size-3.5" />
                  </span>
                  <span className="flex-1">Sign out</span>
                </button>
              </Form>
            </>,
          )}

          {section(
            "boards",
            "flex flex-col gap-0.5 px-2 pb-2",
            <>
              {orgs.map((one) => {
                const here = org?.slug === one.slug && !onAll;
                return (
                  <Link key={one.slug} to={picked(one.slug)} viewTransition aria-current={here ? "page" : undefined} className={row(here)}>
                    <span className={tile(here)}>
                      <OrgDot color={one.color} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{one.name}</span>
                    {here ? <Check className="size-3.5" /> : <ChevronRight className="size-3 text-dim" />}
                  </Link>
                );
              })}
              {orgs.length > 1 ? (
                <Link to={picked("")} viewTransition aria-current={onAll ? "page" : undefined} className={row(onAll)}>
                  <span className={tile(onAll)}>
                    <LayerGroup className="size-3.5" />
                  </span>
                  <span className="flex-1">All orgs</span>
                  {onAll ? <Check className="size-3.5" /> : <ChevronRight className="size-3 text-dim" />}
                </Link>
              ) : null}
              <Link to="/orgs/new" className={row(pathname === "/orgs/new")}>
                <span className={tile(pathname === "/orgs/new")}>
                  <Plus className="size-3.5" />
                </span>
                <span className="flex-1">New org</span>
                <ChevronRight className="size-3 text-dim" />
              </Link>
            </>,
          )}

          {section(
            "org",
            "flex flex-col gap-2 px-2 pb-2",
            pages ? (
              <>
                <p className="flex items-center gap-2 px-2 pt-1 font-medium">
                  <OrgDot color={pages.color} />
                  <span className="min-w-0 truncate">{pages.name}</span>
                </p>
                <div className="grid grid-cols-3 gap-1">
                  {ORG_PAGES.map((page) => {
                    const to = orgPagePath(pages.slug, page.to);
                    const here = pathname.startsWith(to);
                    return (
                      <Link
                        key={page.to}
                        to={to}
                        aria-current={here ? "page" : undefined}
                        className={`press flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs ${
                          here ? "bg-fg text-bg" : "text-muted hover:bg-surface-2 hover:text-fg"
                        }`}
                      >
                        <span className={`flex size-9 items-center justify-center rounded-lg ${here ? "bg-bg/15" : "bg-surface-2"}`}>
                          {page.icon("size-4")}
                        </span>
                        {page.label}
                      </Link>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="px-2 py-6 text-center text-muted">No org yet. Boards makes one.</p>
            ),
          )}

          {section(
            "look",
            "flex flex-col gap-2 px-3 pb-3 pt-1",
            <>
              <SchemeSegments />
              <SoundRow />
              <div className="hidden h-9 items-center gap-3 pointer-fine:flex">
                <span className="flex-1 text-muted">Keys</span>
                <KeysButton />
              </div>
            </>,
          )}
        </div>
      </div>
    </details>
  );
}

/**
 * The sound switch of the You panel: on, as the app starts, or muted, which
 * the browser remembers. See `app/sound.ts`.
 */
function SoundRow() {
  const on = useSoundOn();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => {
        setMuted(on);
        if (!on) window.setTimeout(() => play("pick"), 0);
      }}
      className="press flex h-9 items-center gap-3 rounded-lg text-left"
    >
      <span className="flex flex-1 items-center gap-2 text-muted">
        {on ? <VolumeHigh className="size-3.5" /> : <VolumeXmark className="size-3.5" />}
        Sound
      </span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-bg after:shadow-sm after:transition-transform after:duration-200 after:ease-out ${
          on ? "bg-fg after:translate-x-4" : "bg-border"
        }`}
      />
    </button>
  );
}
