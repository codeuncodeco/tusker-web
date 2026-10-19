# The dock holds the ways out, and Tusker starts on the first org

Built on the `ui-sandbox` branch. Amends [ADR-0029](./0029-the-org-select-scopes-one-board.md).

The header held everything: the org select, the page tabs, a menu of org pages,
the person menu and the colour scheme. On a wide screen that was a row of
controls the eye had to sort through on every page. On a phone it was two
menus.

## Three buttons at the bottom right

The ways to another page now sit in a dock fixed to the bottom right, where a
thumb and a pointer both find them:

- **View.** One glyph. One click steps Board, Week, Plan, Focus and round
  again, as the colour scheme button steps its schemes. Shift-click steps back.
- **Settings.** A gear that opens a panel. It holds the org select, the org's
  pages (Clients, Decisions, Archive, Fields, Members, its settings) and New
  org.
- **Profile.** The person's avatar. It opens the account as a modal over the
  page.

The header keeps where the person stands, "Studio / Board", and the two
buttons that change how the page is drawn: the keys and the colour scheme.

The modal is drawn only while it is open. `isPagePress` reads any
`role="dialog"` on the page as a raised prompt and stops the list keys, so a
closed modal that stayed in the page would stop them for good.

## The first org is the start

`/` sends a signed-in person to the board of their first org, and so does
every fallback that sent them to the unified board: sign-in, the directory,
leaving an org. One org's board has the powers: its stored order, its member
filter, its field filters and its search. All is still there, one pick away
in the settings panel. Week, Plan and Focus still span every org, because a
person's day does.

The View button's Board is the board of the org in view. On a page that spans
orgs, it is the board the browser last stood on, kept under `tusker:scope`,
and else the first org's.

## Consequences

- The org select, the page tabs, the pages menu and the person menu are gone
  from the header. ADR-0029's rule stands: a board's scope is All or one org.
  Only the control that picks it moved.
- Every page leaves room at its foot for the dock, so it never covers the last
  line. On a task page on a phone the dock rises above the task bar.
- Backlog folded away is a bar at the left edge of the board, not a checkbox
  across the page. Opened by hand, it folds back from its head.
