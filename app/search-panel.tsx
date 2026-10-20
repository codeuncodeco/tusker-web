/**
 * The search, in the top right corner of every signed-in page: one button,
 * fixed, and a panel under it. See ADR-0038.
 *
 * - **Search** is global. It finds tasks, by title or number, and clients,
 *   across every org the person belongs to, and the pages of the app, as the
 *   person types. ↑ and ↓ walk the answers and Enter opens one. On an org
 *   board it also offers to narrow the board to the words.
 * - **Filters** are the board's. A board hands its filters to the panel, and
 *   the button counts the ones that narrow anything.
 *
 * `/` opens it from anywhere a press is the page's, and so does Cmd or Ctrl
 * and K from anywhere. Escape, a click outside, and the button close it.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Link, useFetcher, useLocation, useNavigate, useSearchParams } from "react-router";

import { STATUS_LABEL } from "./board";
import { clientPath } from "./client-tag";
import { Search, Sliders, XMark } from "./icons";
import { isPagePress } from "./keys";
import { OrgDot } from "./org-chip";
import { taskPath } from "./paths";
import type { Found } from "./routes/search";
import { SEARCH_NAME } from "./search";
import { taskLabel } from "./task-number";

/**
 * Where a board's filters are drawn: the panel's own box, once the panel is on
 * the page. `undefined` means no panel has ever been drawn, as in a test that
 * draws a board alone, and the board then draws its filters in place.
 */
type Slot = { node: HTMLElement | null; active: number };

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
 * server render or a board drawn alone, they stand in place, in a row, as the
 * board's Top row drew them.
 *
 * `active` is how many of them narrow the board, which the button counts.
 */
export function BoardFilters({ active, children }: { active: number; children: React.ReactNode }) {
  const held = useSlot();

  useEffect(() => {
    if (!held || held.active === active) return;
    setSlot({ ...held, active });
  }, [held, active]);
  useEffect(
    () => () => {
      if (slot) setSlot({ ...slot, active: 0 });
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

/** One line of the filters: what it narrows by, then its chips. */
export function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[0.625rem] uppercase tracking-[0.15em] text-dim">{label}</span>
      {children}
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
          to: `/o/${org}/${page}`,
        }))
      : []),
  ];
}

/** One answer of the panel, flattened, so ↑ and ↓ walk them all in order. */
type Answer = { key: string; to: string; body: React.ReactNode };

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState("");
  const [at, setAt] = useState(0);
  const found = useFetcher<Found>();
  const box = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const held = useSlot();
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
      if (panel.current?.parentElement?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) box.current?.focus();
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
        to: `?${narrowed}`,
        body: (
          <span className="flex items-center gap-2">
            <Sliders className="size-3 text-dim" />
            Narrow this board to “{q}”
          </span>
        ),
      });
    }
    for (const task of found.data?.tasks ?? []) {
      answers.push({
        key: `t${task.id}`,
        to: taskPath(task.id),
        body: (
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs tabular-nums text-dim">{taskLabel(task.id)}</span>
            <span className="truncate">{task.title}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-dim">
              {STATUS_LABEL[task.status]}
              <OrgDot color={task.org.color} />
            </span>
          </span>
        ),
      });
    }
    for (const client of found.data?.clients ?? []) {
      answers.push({
        key: `c${client.slug}:${client.value}`,
        to: clientPath(client.slug, client.value),
        body: (
          <span className="flex items-center gap-2">
            <span className="text-xs text-dim">Client</span>
            {client.label}
            <span className="ml-auto text-xs text-dim">{client.org}</span>
          </span>
        ),
      });
    }
    for (const page of pagesOf(pathname).filter((one) => one.label.toLowerCase().includes(lower))) {
      answers.push({
        key: `p${page.to}`,
        to: page.to,
        body: (
          <span className="flex items-center gap-2">
            <span className="text-xs text-dim">Page</span>
            {page.label}
          </span>
        ),
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
    <div className="fixed right-3 top-3 z-40 print:hidden">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-label={active > 0 ? `Search and filters, ${active} on` : "Search and filters"}
        title="Search and filters  /"
        className={`press relative flex size-11 items-center justify-center rounded-full border shadow-lg hover:-translate-y-0.5 hover:shadow-xl ${
          open || active > 0 ? "border-fg bg-fg text-bg" : "border-border bg-surface text-fg"
        }`}
      >
        <Search className="size-4" />
        {active > 0 ? (
          <span
            key={active}
            className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border-2 border-bg bg-win text-[0.625rem] font-semibold text-bg motion-safe:animate-pop"
          >
            {active}
          </span>
        ) : null}
      </button>

      {/* Drawn even while shut, so a board's filters have somewhere to go;
          `hidden` keeps it out of sight and out of reach. */}
      <div
        ref={panel}
        hidden={!open}
        className="absolute right-0 top-full mt-2 flex max-h-[80dvh] w-[min(30rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl motion-safe:animate-rise-in"
      >
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            go(answers[cursor]);
          }}
          className="flex items-center gap-2 border-b border-border px-4"
        >
          <Search className="size-4 text-dim" />
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
            placeholder="Search every task, client and page"
            aria-label="Search"
            autoComplete="off"
            className="h-12 min-w-0 flex-1 bg-transparent focus:outline-none"
          />
          {words ? (
            <button
              type="button"
              onClick={() => setWords("")}
              aria-label="Clear the search"
              className="press flex size-7 items-center justify-center rounded text-dim hover:text-fg"
            >
              <XMark className="size-3.5" />
            </button>
          ) : (
            <kbd className="hidden rounded border border-border px-1.5 text-[0.625rem] text-dim pointer-fine:inline">/</kbd>
          )}
        </form>

        <div className="flex flex-col overflow-y-auto">
          {q ? (
            <ul aria-label="Answers" className="flex flex-col border-b border-border p-2">
              {answers.length === 0 ? (
                <li className="px-3 py-2 text-muted">{found.state === "idle" ? "Nothing matches." : "Searching…"}</li>
              ) : (
                answers.map((answer, index) => (
                  <li key={answer.key}>
                    <Link
                      to={answer.to}
                      preventScrollReset
                      aria-current={index === cursor ? "true" : undefined}
                      onMouseEnter={() => setAt(index)}
                      onClick={(event) => {
                        event.preventDefault();
                        go(answer);
                      }}
                      className={`flex rounded-lg px-3 py-2 ${index === cursor ? "bg-surface-2 text-fg" : "text-muted"}`}
                    >
                      {answer.body}
                    </Link>
                  </li>
                ))
              )}
            </ul>
          ) : null}

          {/* The board's filters land here. A page with none leaves it empty. */}
          <div
            ref={(node) => {
              if (node && slot?.node !== node) setSlot({ node, active: slot?.active ?? 0 });
            }}
            className="flex flex-col gap-4 p-4 empty:hidden"
          />
        </div>
      </div>
    </div>
  );
}
