/**
 * What every signed-in page draws round its work, and no bar: the page gives
 * its width and its height to the tasks. See ADR-0037 and ADR-0038.
 *
 * - **Search** sits in the top right corner, fixed: one button that opens the
 *   global search and the board's filters. See `search-panel.tsx`.
 * - **The dock** sits in the bottom right corner: the View button, the
 *   settings panel and the profile button. See `dock.tsx`.
 *
 * Where the person stands, "Studio / Board", is still said: to a screen
 * reader as the page's heading on a board, and in the title of the View
 * button. The address is the only current org, and the header reads which
 * page the person stands on from the location, so no route has to say.
 */

import { useLocation } from "react-router";

import type { Me } from "./assignees";
import type { OrgHeld } from "./current-org";
import { Dock, VIEW_LOOK, viewOf } from "./dock";
import { boardOf } from "./org-select";
import { GlobalSearch } from "./search-panel";

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
  if (/(^|\/)t\/\d+$/.test(pathname)) return "Task";
  const org = pathname.match(/^\/o\/[^/]+\/(?:board\/)?([^/]+)/);
  if (org) return ORG_PAGE_NAMES[org[1]!] ?? null;
  return PERSON_PAGE_NAMES[pathname] ?? null;
}

/**
 * The search, the dock and, on a board, the page's heading.
 *
 * `orgs` is every org the person belongs to, first joined first. `org` is the
 * org of the address, or the one org of a person in one, and null on a person
 * page of a person in several, where the board in view is All.
 */
export function Header({ orgs, org, me }: { orgs: OrgHeld[]; org: OrgHeld | null; me?: Me }) {
  const { pathname } = useLocation();
  const onTask = pathname.startsWith("/t/");
  // A board with a modal open over it is still the board in view.
  const board = org ? boardOf(org.slug) : null;
  const onBoard =
    pathname === "/me" ||
    pathname.startsWith("/me/t/") ||
    (board !== null && (pathname === board || pathname.startsWith(`${board}/`)));
  const page = pageName(pathname, onBoard);
  // On All, and on Week, Plan and Focus, which span every org, no org is in
  // view. A person in one org always stands in it.
  const spansOrgs = org === null || (pathname.startsWith("/me") && orgs.length > 1);
  const where = `${spansOrgs ? "All orgs" : org!.name}${page ? ` / ${page}` : ""}`;

  return (
    <>
      {/* A board has no other heading: the columns are the page. */}
      {onBoard ? <h1 className="sr-only">{where}</h1> : null}
      <GlobalSearch />
      <Dock orgs={orgs} org={spansOrgs && !onTask ? null : org} me={me} onBoard={onBoard} raised={onTask} where={where} />
    </>
  );
}
