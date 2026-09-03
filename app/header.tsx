/**
 * The one header every signed-in page draws.
 *
 * The bar has two rows. Row 1 answers "who and where am I": the wordmark, the
 * current org and the account, all plain text. Row 2 answers "where can I go":
 * every page, as a bordered button. The person axis and the org axis are peers,
 * so row 2 draws both halves at once and dims neither. See ADR-0011.
 *
 * Nothing here is drawn by rule. A control that comes and goes teaches
 * nothing, which is the defect this header replaces.
 *
 * The page a person is on takes no link, and the header reads which page that
 * is from the location, so no route has to say.
 */

import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router";

import type { OrgHeld } from "./current-org";

/** The pages of one org the header lists inline, in that order. */
const INLINE = [
  { to: "board", label: "Board" },
  { to: "decisions", label: "Decisions" },
  { to: "archive", label: "Archive" },
] as const;

/** The rare admin pages, behind the Manage menu. */
const MANAGE = [
  { to: "fields", label: "Fields" },
  { to: "members", label: "Members" },
  { to: "settings", label: "Settings" },
] as const;

/** The pages of the person axis. Tasks is `/me` itself, so it matches exactly. */
const PERSON = [
  { to: "/me", label: "Tasks", exact: true },
  { to: "/me/week", label: "Week", exact: false },
  { to: "/me/plan", label: "Plan", exact: false },
  { to: "/me/focus", label: "Focus", exact: false },
] as const;

/** The address of one page of one org. Every link in the org half is one. */
function pageOf(slug: string, page: string): string {
  return `/o/${slug}/${page}`;
}

/**
 * The look of one button of row 2. The page a person stands on fills, which is
 * the pressed look the Today chip already carries: one idiom, not two.
 */
function buttonClass(here: boolean): string {
  return `rounded border px-3 py-1 ${here ? "border-fg bg-fg text-bg" : "border-border"}`;
}

/**
 * One page of row 2, as a button. The current page takes no link, so the
 * header says where you are by what it does not offer, and colour repeats it.
 */
function Page({ to, here, children }: { to: string; here: boolean; children: React.ReactNode }) {
  if (here) {
    return (
      <span aria-current="page" className={buttonClass(true)}>
        {children}
      </span>
    );
  }
  return (
    <Link to={to} className={buttonClass(false)}>
      {children}
    </Link>
  );
}

/**
 * A plain link, or the plain word when the person already stands on the page.
 * Row 1 and the inside of a menu draw these; row 2 draws buttons.
 */
function Here({ to, here, children }: { to: string; here: boolean; children: React.ReactNode }) {
  if (here) {
    return (
      <span aria-current="page" className="font-medium">
        {children}
      </span>
    );
  }
  return (
    <Link to={to} className="text-muted hover:underline">
      {children}
    </Link>
  );
}

/**
 * A menu that needs no script. `details` opens on click and on Enter, and a
 * browser with no script still opens it, which keeps every page of an org
 * reachable the way the switcher was.
 *
 * The `▾` stays whatever the summary looks like: a dropdown with no affordance
 * is a trap.
 *
 * Script only closes it. A click outside and Esc close the menu, which every
 * other menu does. With no script the menu still opens, and a second click on
 * the summary still closes it.
 */
function Menu({
  label,
  summaryClass = "",
  children,
}: {
  label: React.ReactNode;
  /** What the summary looks like. Row 1 draws plain text; row 2 a button. */
  summaryClass?: string;
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
        className={`flex cursor-pointer list-none items-baseline gap-1 whitespace-nowrap marker:content-none hover:underline ${summaryClass}`}
      >
        <span className="max-w-48 truncate">{label}</span>
        <span aria-hidden="true">▾</span>
      </summary>
      {/* The panel grows to its widest item (`w-max`) and stops at `max-w-72`.
          A name longer than that clips; it does not wrap. */}
      <ul
        // A link inside keeps the page, so the menu has to close itself.
        onClick={() => {
          if (menu.current) menu.current.open = false;
        }}
        className="absolute right-0 z-10 mt-1 flex w-max min-w-40 max-w-72 flex-col gap-1 whitespace-nowrap rounded border border-border bg-surface p-2 shadow-lg"
      >
        {children}
      </ul>
    </details>
  );
}

/**
 * The header, on every signed-in page.
 *
 * `orgs` is every org the person belongs to, personal first, and `org` is the
 * current one. A person who belongs to no org at all gets the org half as the
 * one link that can help them: New org.
 */
export function Header({ orgs, org }: { orgs: OrgHeld[]; org: OrgHeld | null }) {
  const { pathname } = useLocation();
  // A task belongs to one org and never to two, so a task page stands in the
  // org half like every other org page.
  const inOrg = pathname.startsWith("/o/");
  /** True while the person stands on this page of the current org. */
  const here = (page: string) => inOrg && org !== null && pathname === pageOf(org.slug, page);

  return (
    <header className="flex flex-col gap-2 border-b border-border px-8 py-3">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <Link to="/me" className="text-lg font-semibold tracking-tight">
          Tusker
        </Link>

        <Menu label={org ? org.name : "Orgs"}>
          {orgs.map((one) => (
            <li key={one.slug} className="flex items-baseline gap-2">
              <Link to={pageOf(one.slug, "board")} className="truncate hover:underline">
                {one.name}
              </Link>
              {one.kind === "personal" ? (
                <span className="shrink-0 text-xs uppercase tracking-wide text-muted">personal</span>
              ) : null}
            </li>
          ))}
          <li className="border-t border-border pt-1">
            <Link to="/orgs/new" className="hover:underline">
              New org
            </Link>
          </li>
        </Menu>

        <span className="ml-auto">
          <Here to="/account" here={pathname === "/account"}>
            Account
          </Here>
        </span>
      </div>

      {/* The two halves sit side by side, parted by whitespace alone: the bar
          already carries a bottom border, and a rule between peers reads as a
          split. */}
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <nav aria-label="You" className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          {PERSON.map((page) => (
            <Page
              key={page.to}
              to={page.to}
              here={!inOrg && (page.exact ? pathname === page.to : pathname.startsWith(page.to))}
            >
              {page.label}
            </Page>
          ))}
        </nav>

        {org ? (
          <nav aria-label="Org" className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
            {INLINE.map((page) => (
              <Page key={page.to} to={pageOf(org.slug, page.to)} here={here(page.to)}>
                {page.label}
              </Page>
            ))}
            <Menu
              label="Manage"
              summaryClass={buttonClass(MANAGE.some((page) => here(page.to)))}
            >
              {MANAGE.map((page) => (
                <li key={page.to}>
                  <Here to={pageOf(org.slug, page.to)} here={here(page.to)}>
                    {page.label}
                  </Here>
                </li>
              ))}
            </Menu>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
