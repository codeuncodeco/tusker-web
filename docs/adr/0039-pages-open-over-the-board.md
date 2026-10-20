# Pages open over the board

Built on the `ui-sandbox` branch. Amends [ADR-0030](./0030-a-task-number-names-one-task-across-orgs.md),
[ADR-0037](./0037-the-dock-holds-the-ways-out.md) and
[ADR-0038](./0038-the-board-takes-the-page.md).

Every page off the board replaced the board. Opening a task, a client or the
decision log was a jump to another page, and coming back was another. The
person lost where they were twice for one look.

## A page off the board is a modal over it

A task, and every page of an org, is now a child route of the board it opens
from, drawn as a modal over it:

- `/o/acme/board/t/12`
- `/o/acme/board/clients/Acme`
- `/o/acme/board/decisions`, `archive`, `fields`, `members`, `settings`

A task opened from the unified board, Week, Plan or Focus opens over that
view: `/me/t/12`, `/me/week/t/12`. The board behind stays drawn, dimmed, and
keeps its own address, filters and all. The browser's Back closes the modal,
and Forward opens it again.

The modal has an app bar. Back and Forward walk the browser's history, the
page's name sits in the middle, and ✕ closes onto the page behind; Escape and
a click on the shade close it too. On a phone it is a full sheet with a grip
that pulls down to close.

`/t/12` still names one task, for a link from anywhere. It draws the same sheet
on its own. An org page's old address, `/o/acme/members`, redirects to its
place under the board, so a mailed link still lands. The account page and New
org draw the same sheet.

A page modal carries `data-page`. `isPagePress` reads a press inside it as the
page's, so `e` still opens a task's description; a raised prompt over it still
takes every press.

## The task is one crisp sheet

The task's acts (Mark done, Archive, Delete) head the sheet. The title is large,
reads as text, and turns into its box on one click. The description sits
beside a card that holds every property one click away. The phone's task bar
and Details drawer are gone: the sheet holds everything on a phone too.

## The dock, the drawers and the light

- **View** unfurls every view as a pill when the pointer is over it, or on a
  first tap on a phone. The centre still steps one view a click, and the fan
  stays out while it does, the view in view filled.
- **Settings** is a panel of rows and tiles, each with its glyph, with a target
  a thumb can hit. A host can lend it a row through `window.tuskerExtras`; the
  sandbox lends Reset sample data, and draws no badge of its own.
- **Search** groups its answers by kind, each with its glyph. Each filter row
  is named and marked. Clear all gives the board back as it starts. On a phone
  it is a sheet over the whole screen.
- **Cancelled** pulls up from the bottom left as a sheet, its cards in a grid.
  **Backlog** still pulls out from the left edge. A tab whose column holds
  nothing is not drawn.
- **The colour scheme** dissolves slowly from one to the other, the new scheme
  arriving from a light haze, instead of a quick wipe.
- **A step from view to view** crossfades and drifts a step, through the
  browser's view transitions.

## Consequences

- The board's loader runs under every org page, so the page behind is the
  board as the person left it. Opening a modal re-runs no board read; a post
  inside it revalidates both.
- A row of plan mode and the week page wraps its controls under its title on a
  narrow screen.
