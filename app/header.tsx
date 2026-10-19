/**
 * The one header every signed-in page draws, in one row: where the person
 * stands, and the two buttons that change how the page is drawn. See
 * ADR-0029 and ADR-0037.
 *
 * At the left, the org in view and the page: "Studio / Board". On a board that
 * line is the page's heading. At the right, the Key guide, where the page
 * gives list keys, and the colour scheme, one click a step.
 *
 * Everything that moves the person elsewhere sits in the dock at the bottom
 * right: the View button, the settings panel, which picks the board's org and
 * holds the org's pages, and the profile button. See `dock.tsx`.
 *
 * The address is the only current org, and the header reads which page the
 * person stands on from the location, so no route has to say.
 */

import { useLocation } from "react-router";

import type { Me } from "./assignees";
import {
  COLOUR_SCHEME_ACTION,
  type ColourScheme,
  nextScheme,
  useColourScheme,
  useColourSchemeFetcher,
} from "./colour-scheme";
import type { OrgHeld } from "./current-org";
import { Dock, VIEW_LOOK, viewOf } from "./dock";
import { Desktop, Keyboard, Moon, Sun } from "./icons";
import { keyHint } from "./key-hint";
import { useKeyGuide } from "./keyed-list";
import { OrgDot } from "./org-chip";
import { boardOf } from "./org-select";

/** The org pages, by the last step of their address, as the header names them. */
const ORG_PAGE_NAMES: Record<string, string> = {
  clients: "Clients",
  decisions: "Decisions",
  archive: "Archive",
  fields: "Fields",
  members: "Members",
  settings: "Settings",
};

/** The person pages that are no view, as the header names them. */
const PERSON_PAGE_NAMES: Record<string, string> = {
  "/account": "Account",
  "/orgs/new": "New org",
  "/orgs": "Orgs",
};

/** What the header calls the page at this address, or null for none. */
export function pageName(pathname: string, onBoard: boolean): string | null {
  const view = viewOf(pathname, onBoard);
  if (view) return VIEW_LOOK[view].label;
  if (pathname.startsWith("/t/")) return "Task";
  const org = pathname.match(/^\/o\/[^/]+\/([^/]+)/);
  if (org) return ORG_PAGE_NAMES[org[1]!] ?? null;
  return PERSON_PAGE_NAMES[pathname] ?? null;
}

/**
 * The Key guide, one click away beside the colour scheme, on a page that gives
 * list keys and where the pointer is fine. The person menu still holds it.
 */
function KeysButton() {
  const guide = useKeyGuide();
  if (!guide.given) return null;
  const mark = keyHint("guide");

  return (
    <button
      type="button"
      {...mark.keys}
      onClick={() => guide.open(null)}
      aria-label="Keys"
      title="Keys ?"
      className="press hidden size-[38px] items-center justify-center rounded border border-border bg-bg hover:border-dim hover:bg-surface-2 sm:pointer-fine:flex"
    >
      <Keyboard className="size-4" />
    </button>
  );
}

/** The name and the glyph of each colour scheme, as the button draws them. */
const SCHEME_LOOKS: Record<ColourScheme, { label: string; icon: (className: string) => React.ReactNode }> = {
  light: { label: "Light", icon: (className) => <Sun className={className} /> },
  dark: { label: "Dark", icon: (className) => <Moon className={className} /> },
  system: { label: "System", icon: (className) => <Desktop className={className} /> },
};

/** The radius the reveal grows to: far enough to cover the farthest corner. */
function revealRadius(x: number, y: number): number {
  return Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
}

/**
 * The colour scheme button: one glyph, and one click steps to the next scheme,
 * Light to Dark to System and round again. See `nextScheme`.
 *
 * With script, the pick posts through a fetcher, and the page draws it while
 * the post is in flight, so it changes at once. Where the browser can, the new
 * scheme grows out of the button as a circle over the old one, and the glyph
 * spins in. A person who asked for less motion gets the change at once.
 *
 * With no script it is a plain POST form, and the button itself sends the next
 * scheme. The form names the page the person stands on, and the reply
 * redirects back there.
 */
function ColourSchemeButton() {
  const scheme = useColourScheme();
  const fetcher = useColourSchemeFetcher();
  const { pathname, search } = useLocation();
  const next = nextScheme(scheme);
  const name = `Colour scheme: ${SCHEME_LOOKS[scheme].label}. Switch to ${SCHEME_LOOKS[next].label}.`;

  function pick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const send = () =>
      fetcher.submit(
        { scheme: next },
        { method: "post", action: COLOUR_SCHEME_ACTION, defaultShouldRevalidate: false, flushSync: true },
      );

    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm || typeof document.startViewTransition !== "function") {
      void send();
      return;
    }

    // The circle grows from the button's centre.
    const box = event.currentTarget.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const root = document.documentElement;
    root.classList.add("scheme-reveal");
    const transition = document.startViewTransition(() => {
      void send();
    });
    void transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${revealRadius(x, y)}px at ${x}px ${y}px)`] },
        { duration: 520, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
    void transition.finished.finally(() => root.classList.remove("scheme-reveal"));
  }

  return (
    <form method="post" action={COLOUR_SCHEME_ACTION}>
      <input type="hidden" name="next" value={`${pathname}${search}`} />
      <button
        name="scheme"
        value={next}
        onClick={pick}
        aria-label={name}
        title={name}
        className="press flex size-[38px] items-center justify-center overflow-hidden rounded border border-border bg-bg hover:border-dim hover:bg-surface-2"
      >
        {/* The key draws the glyph again on every pick, so it spins in. */}
        <span key={scheme} className="flex motion-safe:animate-spin-in">
          {SCHEME_LOOKS[scheme].icon("size-4")}
        </span>
      </button>
    </form>
  );
}

/**
 * The header, on every signed-in page, and the dock it brings.
 *
 * `orgs` is every org the person belongs to, first joined first. `org` is the
 * org the header names: the org of the address, or the one org of a person in
 * one, and null on a person page of a person in several, where the board in
 * view is All.
 */
export function Header({ orgs, org, me }: { orgs: OrgHeld[]; org: OrgHeld | null; me?: Me }) {
  const { pathname } = useLocation();
  const onTask = pathname.startsWith("/t/");
  const onBoard = pathname === "/me" || (org !== null && pathname === boardOf(org.slug));
  const page = pageName(pathname, onBoard);
  // On All, and on Week, Plan and Focus, which span every org, no org is in
  // view. A person in one org always stands in it.
  const spansOrgs = org === null || (pathname.startsWith("/me") && orgs.length > 1);

  const where = (
    <span className="flex min-w-0 items-center gap-2 text-lg">
      {spansOrgs ? (
        <span className="flex shrink-0 -space-x-1" aria-hidden="true">
          {orgs.slice(0, 3).map((one) => (
            <OrgDot key={one.slug} color={one.color} />
          ))}
        </span>
      ) : (
        <OrgDot color={org!.color} />
      )}
      <span className="truncate font-medium">{spansOrgs ? "All orgs" : org!.name}</span>
      {page ? (
        <>
          <span aria-hidden="true" className="text-dim">
            /
          </span>
          <span key={page} className="truncate text-muted motion-safe:animate-rise-in">
            {page}
          </span>
        </>
      ) : null}
    </span>
  );

  return (
    <>
      {/* On a board, from `sm` up, the header sticks, and the board's Top row
          sticks under it at `top-16`, so the height is fixed and not its
          content's. Every other page scrolls it away. See #191. */}
      <header
        className={`top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-bg px-4 sm:px-8 ${onBoard ? "sm:sticky" : ""}`}
      >
        {onBoard ? <h1 className="min-w-0 font-normal">{where}</h1> : where}
        <span className="ml-auto flex items-center gap-2">
          <KeysButton />
          <ColourSchemeButton />
        </span>
      </header>
      <Dock orgs={orgs} org={spansOrgs && !onTask ? null : org} me={me} onBoard={onBoard} raised={onTask} />
    </>
  );
}
