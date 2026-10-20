/**
 * The search, in the top right corner of every signed-in page: one button,
 * fixed, and a panel under it. See ADR-0038 and ADR-0039.
 *
 * - **Search** is global. It finds tasks, by title or number, clients, and the
 *   pages of the app, across every org the person belongs to, as they type.
 *   The answers come in groups, each with its glyph. ↑ and ↓ walk them and
 *   Enter opens one. On an org board it also offers to narrow the board to
 *   the words.
 * - **Filters** are the board's. A board hands its filters to the panel, each
 *   row named and marked with a glyph, and the button counts the ones that
 *   narrow anything. Clear all gives the board back as it starts.
 *
 * `/` opens it from anywhere a press is the page's, and so does Cmd or Ctrl
 * and K from anywhere. Escape, a click outside, and the button close it. On a
 * phone it is a sheet over the whole screen.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Link, useFetcher, useLocation, useNavigate, useSearchParams } from "react-router";

import { play } from "./sound";
import { STATUS_LABEL } from "./board";
import { clientPath } from "./client-tag";
import { ChevronRight, CircleHalf, Folder, Search, Sliders, XMark } from "./icons";
import { isPagePress } from "./keys";
import { OrgDot } from "./org-chip";
import { useTaskHref } from "./paths";
import type { Found } from "./routes/search";
import { SEARCH_NAME } from "./search";
import { taskLabel } from "./task-number";

/**
 * Where a board's filters are drawn: the panel's own box, once the panel is on
 * the page. `undefined` means no panel has ever been drawn, as in a test that
 * draws a board alone, and the board then draws its filters in place.
 */
type Slot = { node: HTMLElement | null; active: number; clear: string | null; has: boolean };

let slot: Slot | undefined;
const listeners = new Set<() => void>();

function setSlot(next: Slot) {
  slot = next;
  for (const listener of listeners) listener();
}

function useSlot(): Slot | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => slot,
    () => undefined,
  );
}

/**
 * A board's filters, handed to the search panel. Where no panel is drawn, a
 * server render or a board drawn alone, they stand in place.
 *
 * `active` is how many of them narrow the board, which the button counts.
 * `clear` is the address that gives the board back as it starts.
 */
export function BoardFilters({
  active,
  clear = null,
  children,
}: {
  active: number;
  clear?: string | null;
  children: React.ReactNode;
}) {
  const held = useSlot();

  useEffect(() => {
    if (!held || (held.active === active && held.clear === clear && held.has)) return;
    setSlot({ ...held, active, clear, has: true });
  }, [held, active, clear]);
  useEffect(
    () => () => {
      if (slot) setSlot({ ...slot, active: 0, clear: null, has: false });
    },
    [],
  );

  if (held === undefined) {
    // In a browser the panel is about to take them: draw nothing for the one
    // frame before it does, rather than a row that jumps away.
    if (typeof document !== "undefined") return null;
    return <nav aria-label="Filters" className="flex flex-wrap items-baseline gap-4">{children}</nav>;
  }
  return held.node ? createPortal(children, held.node) : null;
}

/** One line of the filters: its glyph and what it narrows by, then its chips. */
export function FilterRow({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    // A flat row: no box of its own, a hairline between it and the next. The
    // label sits in one column, the chips in the next. See ADR-0040.
    <div className="flex flex-col gap-2 py-3 first:pt-1 last:pb-1 sm:grid sm:grid-cols-[6.5rem_1fr] sm:items-start sm:gap-3">
      <span className="flex h-6 items-center gap-2 text-xs text-muted">
        <span className="flex text-dim">{icon ?? <Sliders className="size-3" />}</span>
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** The pages a search can name, by the words a person would type. */
function pagesOf(pathname: string): { label: string; to: string }[] {
  const org = pathname.match(/^\/o\/([^/]+)/)?.[1];
  return [
    { label: "Week", to: "/me/week" },
    { label: "Plan", to: "/me/plan" },
    { label: "Focus", to: "/me/focus" },
    { label: "All orgs", to: "/me" },
    { label: "Account", to: "/account" },
    ...(org
      ? ["clients", "decisions", "archive", "fields", "members", "settings"].map((page) => ({
          label: page[0]!.toUpperCase() + page.slice(1),
          to: `/o/${org}/board/${page}`,
        }))
      : []),
  ];
}

/** One answer of the panel, flattened, so ↑ and ↓ walk them all in order. */
type Answer = { key: string; group: string; to: string; icon: React.ReactNode; body: React.ReactNode; meta?: React.ReactNode };

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState("");
  const [at, setAt] = useState(0);
  const found = useFetcher<Found>();
  const box = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const held = useSlot();
  const hrefOf = useTaskHref();
  const active = held?.active ?? 0;
  const onOrgBoard = /^\/o\/[^/]+\/board$/.test(pathname);

  // `/` and Cmd-K open it; Escape closes it.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if ((mod && event.key.toLowerCase() === "k") || (event.key === "/" && isPagePress(event))) {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (event.key === "Escape" && open) {
        event.stopPropagation();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  // A click outside closes it.
  useEffect(() => {
    if (!open) return;
    function onDown(event: PointerEvent) {
      if (root.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // A page change closes it, unless it only narrowed the board it stands on.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);

  // Opening and closing have their sounds. The first draw makes none.
  const drawn = useRef(false);
  useEffect(() => {
    if (drawn.current) play(open ? "open" : "close");
    drawn.current = true;
  }, [open]);

  // The answers follow the words, a beat after the last key.
  useEffect(() => {
    const q = words.trim();
    if (!q) return;
    const timer = window.setTimeout(() => void found.load(`/search?${new URLSearchParams({ q })}`), 120);
    return () => window.clearTimeout(timer);
    // `found` is a new object each render; the words are what change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  const q = words.trim();
  const lower = q.toLowerCase();
  const answers: Answer[] = [];
  if (q) {
    if (onOrgBoard) {
      const narrowed = new URLSearchParams(params);
      narrowed.set(SEARCH_NAME, q);
      answers.push({
        key: "narrow",
        group: "This board",
        to: `?${narrowed}`,
        icon: <Sliders className="size-3.5" />,
        body: <>Narrow this board to “{q}”</>,
      });
    }
    for (const task of found.data?.tasks ?? []) {
      answers.push({
        key: `t${task.id}`,
        group: "Tasks",
        to: hrefOf(task.id),
        icon: <CircleHalf className="size-3.5" />,
        body: (
          <>
            <span className="mr-2 text-xs tabular-nums text-dim">{taskLabel(task.id)}</span>
            {task.title}
          </>
        ),
        meta: (
          <>
            {STATUS_LABEL[task.status]}
            <OrgDot color={task.org.color} />
          </>
        ),
      });
    }
    for (const client of found.data?.clients ?? []) {
      answers.push({
        key: `c${client.slug}:${client.value}`,
        group: "Clients",
        to: clientPath(client.slug, client.value),
        icon: <Folder className="size-3.5" />,
        body: client.label,
        meta: client.org,
      });
    }
    for (const page of pagesOf(pathname).filter((one) => one.label.toLowerCase().includes(lower))) {
      answers.push({
        key: `p${page.to}`,
        group: "Pages",
        to: page.to,
        icon: <ChevronRight className="size-3" />,
        body: page.label,
      });
    }
  }
  const cursor = Math.min(at, Math.max(0, answers.length - 1));

  function go(answer: Answer | undefined) {
    if (!answer) return;
    navigate(answer.to, { preventScrollReset: true });
    setWords("");
    if (answer.key !== "narrow") setOpen(false);
  }

  return (
    <div ref={root} className={`fixed right-3 top-3 print:hidden ${open ? "z-[45]" : "z-40"}`}>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-label={active > 0 ? `Search and filters, ${active} on` : "Search and filters"}
        title="Search and filters  /"
        className={`press relative flex h-11 items-center gap-2 rounded-full border px-3.5 shadow-lg hover:-translate-y-0.5 hover:shadow-xl ${
          open || active > 0 ? "border-fg bg-fg text-bg" : "border-border bg-surface text-fg"
        }`}
      >
        <Search className="size-4" />
        {active > 0 ? (
          <span key={active} className="flex items-center gap-1 text-xs font-medium motion-safe:animate-pop-soft">
            <Sliders className="size-3" />
            {active}
          </span>
        ) : (
          <kbd className="hidden rounded border border-border px-1.5 font-mono text-[0.625rem] text-dim pointer-fine:inline">/</kbd>
        )}
      </button>

      {/* Drawn even while shut, so a board's filters have somewhere to go;
          `hidden` keeps it out of sight and out of reach. On a phone it is a
          sheet over the whole screen. */}
      <div
        hidden={!open}
        className="fixed inset-0 flex origin-top-right flex-col bg-surface motion-safe:animate-fade sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[min(42rem,calc(100dvh-5rem))] sm:w-[32rem] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl sm:motion-safe:animate-scale-in"
      >
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            go(answers[cursor]);
          }}
          className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4"
        >
          <Search className="size-4 text-muted" />
          <input
            ref={box}
            value={words}
            onChange={(event) => {
              setWords(event.target.value);
              setAt(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setAt((one) => Math.min(one + 1, answers.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setAt((one) => Math.max(one - 1, 0));
              }
            }}
            placeholder="Search tasks, clients, pages…"
            aria-label="Search"
            autoComplete="off"
            enterKeyHint="go"
            className="h-full min-w-0 flex-1 bg-transparent text-base focus:outline-none"
          />
          {words ? (
            <button
              type="button"
              onClick={() => {
                setWords("");
                box.current?.focus();
              }}
              aria-label="Clear the search"
              className="press flex size-8 items-center justify-center rounded-full text-dim hover:bg-surface-2 hover:text-fg"
            >
              <XMark className="size-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="press rounded-full px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg sm:hidden"
          >
            Done
          </button>
        </form>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {q ? (
            <div aria-label="Answers" className="flex flex-col border-b border-border p-2">
              {answers.length === 0 ? (
                <p className="px-3 py-6 text-center text-muted">{found.state === "idle" ? "Nothing matches." : "Searching…"}</p>
              ) : (
                answers.map((answer, index) => (
                  <div key={answer.key}>
                    {index === 0 || answers[index - 1]!.group !== answer.group ? (
                      <h3 className="flex items-center gap-2 px-2 pb-1 pt-2 font-mono text-[0.625rem] uppercase tracking-[0.15em] text-dim">
                        {answer.group}
                        <span className="tabular-nums">{answers.filter((one) => one.group === answer.group).length}</span>
                      </h3>
                    ) : null}
                    <Link
                      to={answer.to}
                      preventScrollReset
                      aria-current={index === cursor ? "true" : undefined}
                      onMouseEnter={() => setAt(index)}
                      onClick={(event) => {
                        event.preventDefault();
                        go(answer);
                      }}
                      className={`flex h-10 items-center gap-3 rounded-lg px-2 ${index === cursor ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"}`}
                    >
                      <span className={`flex size-6 shrink-0 items-center justify-center rounded-md ${index === cursor ? "bg-fg text-bg" : "bg-surface-2 text-dim"}`}>
                        {answer.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{answer.body}</span>
                      {answer.meta ? (
                        <span className="flex shrink-0 items-center gap-1.5 text-xs text-dim">{answer.meta}</span>
                      ) : null}
                    </Link>
                  </div>
                ))
              )}
            </div>
          ) : null}

          {/* The board's filters land here. A page with none says so. */}
          <section className="flex flex-col gap-1 px-4 py-3">
            <div className="flex h-7 items-center gap-2">
              <h2 className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-[0.15em] text-dim">
                Filters
                {active > 0 ? <span className="text-fg">· {active} on</span> : null}
              </h2>
              {active > 0 && held?.clear ? (
                <Link
                  to={held.clear}
                  preventScrollReset
                  className="press ml-auto rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
                >
                  Clear all
                </Link>
              ) : null}
            </div>
            <div
              ref={(node) => {
                if (node && slot?.node !== node)
                  setSlot({ node, active: slot?.active ?? 0, clear: slot?.clear ?? null, has: slot?.has ?? false });
              }}
              className="flex flex-col divide-y divide-border empty:hidden"
            />
            {held?.has ? null : (
              <p className="px-1 text-xs text-dim">This page has no filters. A board does.</p>
            )}
          </section>
        </div>

        <footer className="hidden h-9 shrink-0 items-center gap-4 border-t border-border px-4 font-mono text-[0.625rem] text-dim pointer-fine:flex">
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>esc close</span>
          <span className="ml-auto">/ or ⌘K anywhere</span>
        </footer>
      </div>
    </div>
  );
}
