# The board takes the page

Built on the `ui-sandbox` branch. Amends [ADR-0018](./0018-the-board-draws-where-work-ended.md),
[ADR-0020](./0020-an-org-colour-is-assigned-not-derived.md) and
[ADR-0037](./0037-the-dock-holds-the-ways-out.md).

Two bars sat over the columns: the header, then the Top row with the add box
and a wall of filter chips. Backlog, opened, took a column; folded, it still
took a strip. And a card could carry five colours at once. The work got what
was left.

## No bar

- **The header is gone.** Where the person stands is said to a screen reader
  as the board's heading, and in the View button's title. The colour scheme
  and keys buttons moved into the settings panel.
- **The Top row is gone.** The add box heads To do, where what it adds lands.
  The filters moved into the search panel.
- **Search is global.** A button in the top right corner, fixed, opens a box
  that finds tasks by title or number, clients and pages, across every org the
  person belongs to, as they type. On an org board it also offers to narrow
  the board to the words, the old search box's act. Under the box sit the
  board's filters. The button counts the filters that narrow anything.

The board hands its filters to the panel through a portal. Where no panel is
drawn, a server render or a board drawn alone in a test, they stand in place.

## Backlog and Cancelled in a drawer

Each is a tab at the left edge of the screen, hidden but for its grip. A click
or a pull slides the column out over the board; with both out, they sit side
by side. A card drags from the drawer onto the board and back. The address
still says what is open, `backlog=1` and `cancelled=1`, so a link opens the
drawer and the loader reads its cards.

ADR-0018's rule, that an org board with no live task shows Backlog, now makes
Backlog's tab glow rather than pull the drawer out by itself. An open drawer
covers the board; opening it is the person's act.

## Few colours

Colour now says three things:

- **Which client:** the dot on the client's tag.
- **Who:** the ring of a person's avatar.
- **Done:** green.

Everything else draws in the page's ink: other field values, the org chip on a
card, the column glyphs, the planned badge, the client page's hero and link
tiles, status dots. An org's colour stays where orgs are picked: the settings
panel and the add box's org chips. Filter chips draw colour for the client
field alone. Yellow keeps its two jobs, focus and selection, and red marks a
delete.

## Consequences

- With no script, a board shows no filters: the panel opens by script. The
  sandbox runs nothing without it. On `main` this wants a no-script road.
- The page leaves room at its left for the tabs and at its right for the
  search button, and nothing else.
