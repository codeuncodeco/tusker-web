/**
 * The one header every signed-in page draws, in one row.
 *
 * At the centre, the org select and ⋯ beside it. The select sets the board's
 * scope: All, or one org. ⋯ names the page a person stands on and holds every
 * page: one Board, whose scope the select sets, then Week, Plan and Focus, then
 * the pages of the org the select names. While the select reads All, no org is
 * named, so ⋯ holds no org page. At the far right, a person menu holds what is
 * no org's. See ADR-0029.
 *
 * The address is the only current org. The select reads it, and a pick goes to
 * the board of that scope at once.
 *
 * The page a person is on takes no link, and the header reads which page that
 * is from the location, so no route has to say.
 */

import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import type { OrgHeld } from "./current-org";
import { Ellipsis, User } from "./icons";
import { OrgDot } from "./org-chip";
import { boardOf } from "./org-select";

/**
 * The pages of the person axis after the board, which the select scopes.
 *
 * A label names the destination and never what the page holds, which is why
 * "Plan" and "Week" stand while those pages head with a day and a week. See
 * #146.
 */
const PERSON = [
  { to: "/me/week", label: "Week" },
  { to: "/me/plan", label: "Plan" },
  { to: "/me/focus", label: "Focus" },
] as const;

/** The pages of one org after its board, in the order ⋯ lists them. */
const ORG = [
  { to: "decisions", label: "Decisions" },
  { to: "archive", label: "Archive" },
  { to: "fields", label: "Fields" },
  { to: "members", label: "Members" },
  { to: "settings", label: "Settings" },
] as const;

/** The pages of the person menu. They belong to no org and to no board. */
const YOURS = [
  { to: "/account", label: "Account" },
  { to: "/orgs/new", label: "New org" },
] as const;

/** The address of one page of one org. Every org link in ⋯ is one. */
function pageOf(slug: string, page: string): string {
  return `/o/${slug}/${page}`;
}

/**
 * The look of the two menu buttons, as tall as the select beside them. The
 * person menu fills softly while a person stands on one of its pages.
 */
function buttonClass(here: boolean): string {
  return `flex h-[38px] items-center rounded border px-3 leading-none ${here ? "border-dim bg-surface-2 font-medium text-fg" : "border-border"}`;
}

/**
 * One row of a menu: a link, or the plain word where the person stands. The
 * whole row is the target, not only its words.
 */
function Item({ to, here, children }: { to: string; here: boolean; children: React.ReactNode }) {
  const row = "flex w-full min-w-0 items-center gap-1.5 px-3 py-1.5";
  return (
    <li>
      {here ? (
        <span aria-current="page" className={`${row} bg-surface-2 font-medium`}>
          {children}
        </span>
      ) : (
        <Link to={to} className={`${row} text-muted hover:bg-border hover:text-fg`}>
          {children}
        </Link>
      )}
    </li>
  );
}

/** A rule between two groups of a menu. */
function Rule() {
  return <li aria-hidden="true" className="border-t border-border" />;
}

/** The heading of one org's group in ⋯: its dot and its name. */
function Section({ org }: { org: OrgHeld }) {
  return (
    <li className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-xs uppercase tracking-wide text-muted">
      <OrgDot color={org.color} />
      <span className="truncate">{org.name}</span>
    </li>
  );
}

/**
 * A menu that needs no script. `details` opens on click and on Enter, and a
 * browser with no script still opens it, which keeps every page reachable.
 *
 * Script only closes it. A click outside and Esc close the menu, which every
 * other menu does. With no script the menu still opens, and a second click on
 * the summary still closes it.
 */
function Menu({
  label,
  icon,
  name,
  here,
  align,
  children,
}: {
  /** Words drawn before the glyph: ⋯ names the page you stand on here. */
  label?: string;
  /** The glyph on the button. */
  icon: React.ReactNode;
  /** What a screen reader reads for the glyph. */
  name: string;
  /** True while the person stands on a page only this menu holds. */
  here: boolean;
  /** The edge of the summary the panel lines up with. */
  align: "left" | "right";
  children: React.ReactNode;
}) {
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => {
      if (menu.current) menu.current.open = false;
    };
    // `pointerdown`, not `click`: the menu has to go before the thing under
    // the pointer reacts.
    const onPointerDown = (event: PointerEvent) => {
      const it = menu.current;
      if (it?.open && event.target instanceof Node && !it.contains(event.target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !menu.current?.open) return;
      // One press means one thing. A keyed list reads Escape on itself now, so
      // a press made in this menu never reaches one; what this stops is every
      // other listener above, the decision prompt's included. See ADR-0022.
      event.stopPropagation();
      close();
      // The summary takes the focus back, or the focus falls to the body and
      // the keyboard loses its place.
      menu.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details ref={menu} className="relative">
      <summary
        className={`cursor-pointer list-none gap-2 whitespace-nowrap marker:content-none ${buttonClass(here)}`}
      >
        {label ? <span className="max-w-48 truncate font-medium">{label}</span> : null}
        {icon}
        <span className="sr-only">{name}</span>
      </summary>
      {/* The panel grows to its widest item (`w-max`) and stops at `max-w-72`.
          A name longer than that clips; it does not wrap. */}
      <ul
        // A link inside keeps the page, so the menu has to close itself.
        onClick={() => {
          if (menu.current) menu.current.open = false;
        }}
        className={`absolute ${align === "left" ? "left-0" : "right-0"} z-10 mt-1 flex w-max min-w-40 max-w-72 flex-col overflow-hidden whitespace-nowrap rounded border border-border bg-surface shadow-lg`}
      >
        {children}
      </ul>
    </details>
  );
}

/**
 * The org select: All, then every org the person belongs to. A pick goes to
 * that scope's board at once. With no script it is a GET form to `/go`, which
 * redirects, and the button inside `<noscript>` sends it.
 *
 * On the board the select is the page's heading. A heading holds no form, so
 * the `h1` sits inside the form and around the control.
 */
function OrgSelect({
  orgs,
  org,
  heading,
}: {
  orgs: OrgHeld[];
  /** The org of the address, or null on a person page, where it reads All. */
  org: OrgHeld | null;
  heading: boolean;
}) {
  const navigate = useNavigate();

  // The border is the label's, so it rings the dot and the select as one
  // control. The select draws no border of its own, and an option cannot draw
  // a dot, so the named org's dot sits before it.
  const control = (
    <label className="flex items-center rounded border border-border bg-bg focus-within:border-fg">
      {org ? (
        <span className="pl-2.5">
          <OrgDot color={org.color} />
        </span>
      ) : null}
      <select
        name="to"
        aria-label="Board"
        value={org?.slug ?? ""}
        onChange={(event) => navigate(boardOf(event.target.value || null))}
        className="h-9 rounded bg-transparent px-2 text-lg font-medium focus:outline-none"
      >
        <option value="">All</option>
        {orgs.map((one) => (
          <option key={one.slug} value={one.slug}>
            {one.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form method="get" action="/go" className="flex items-center gap-2">
      {heading ? <h1 className="font-normal">{control}</h1> : control}
      <noscript>
        <button className={buttonClass(false)}>Go</button>
      </noscript>
    </form>
  );
}

/**
 * The header, on every signed-in page.
 *
 * `orgs` is every org the person belongs to, first joined first. `org` is the
 * org the header names: the org of the address, or the one org of a person in
 * one, and null on a person page of a person in several. A person in one org
 * has nothing to pick, so the select is not drawn and the org's name stands in
 * its place.
 */
export function Header({ orgs, org }: { orgs: OrgHeld[]; org: OrgHeld | null }) {
  const { pathname } = useLocation();
  // A task belongs to one org and never to two, so a task page stands in that
  // org like every other org page.
  const inOrg = pathname.startsWith("/o/");
  // One Board, whose scope the select sets.
  const board = boardOf(org?.slug ?? null);
  const onBoard = pathname === "/me" || (org !== null && pathname === boardOf(org.slug));
  const hereOrg = (page: string) => inOrg && org !== null && pathname === pageOf(org.slug, page);

  // The page you stand on, named on ⋯. A task page names no page of the menu,
  // and the person menu's pages are named there instead.
  const page = onBoard
    ? "Board"
    : (PERSON.find((one) => pathname.startsWith(one.to))?.label ??
      ORG.find((one) => hereOrg(one.to))?.label ??
      (inOrg && pathname.includes("/t/") ? "Task" : undefined));

  const name = org ? (
    <span className="flex items-center gap-1.5 text-lg font-medium">
      <OrgDot color={org.color} />
      <span className="max-w-48 truncate">{org.name}</span>
    </span>
  ) : null;

  return (
    // Three columns: an empty left, the select and ⋯ at the centre, the person
    // menu at the right. The outer two share the rest equally, so the centre
    // stays centred whatever either side holds.
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-4 border-b border-border px-8 py-3">
      <span aria-hidden="true" />
      <div className="flex items-center gap-2">
        {orgs.length > 1 ? (
          <OrgSelect orgs={orgs} org={org} heading={onBoard} />
        ) : onBoard && name ? (
          <h1 className="font-normal">{name}</h1>
        ) : (
          name
        )}

        <Menu label={page} icon={<Ellipsis />} name={page ? "more pages" : "Pages"} here={false} align="left">
          <Item to={board} here={onBoard}>
            Board
          </Item>
          {PERSON.map((one) => (
            <Item key={one.to} to={one.to} here={pathname.startsWith(one.to)}>
              {one.label}
            </Item>
          ))}
          {org ? (
            <>
              <Rule />
              <Section org={org} />
              {ORG.map((one) => (
                <Item key={one.to} to={pageOf(org.slug, one.to)} here={hereOrg(one.to)}>
                  {one.label}
                </Item>
              ))}
            </>
          ) : null}
        </Menu>
      </div>

      {/* What is yours and no org's, at the far right. */}
      <div className="justify-self-end">
        <Menu
          icon={<User />}
          name="You"
          here={YOURS.some((one) => pathname === one.to)}
          align="right"
        >
          {YOURS.map((one) => (
            <Item key={one.to} to={one.to} here={pathname === one.to}>
              {one.label}
            </Item>
          ))}
        </Menu>
      </div>
    </header>
  );
}
