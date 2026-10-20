# The sheet is a bento, and the app has a voice

Built on the `ui-sandbox` branch. Amends [ADR-0038](./0038-the-board-takes-the-page.md)
and [ADR-0039](./0039-pages-open-over-the-board.md).

## Tiles, one surface deep

A task's sheet was a wide empty description beside one tall card that held every
property, and the card held boxes of its own. Every page off the board was a
narrow column of stacked sections.

Now a page is a bento: a grid of tiles, four columns from `sm` up and two on a
phone, each tile as large as what it holds (`app/bento.tsx`).

- **A tile is one surface on the page's ground.** It has a small-caps label
  with its glyph, an act at the top right where it has one, and its content.
  Nothing inside a tile draws a box of its own, apart from chips and inputs.
- **The task sheet:**
  - The title and the acts run across the top.
  - The description is the largest tile.
  - Status, due date, assignees, the decision, each field and the timeline
    are a tile each. Every control is the same one on the same form, saving on
    its own; only the frame differs (`TaskTiles`).
- **The other pages:**
  - Members: a tile per member, with their avatar.
  - Decisions, the archive and fields: a tile per entry.
  - Settings: name, colour, org app and keys as four tiles.
  - Clients: a tile per client, the busiest drawn wide.
  - A client: the client, its open work, its links, and a tile per meeting
    note.
  - The account: tiles too.

## One button for you and your settings

The dock is two buttons: View, and You. You wears the person's avatar and opens
one panel:

1. Who they are: picture, name, email and colour, each changed in place.
2. Every board.
3. The org's pages.
4. How the page looks: a three-way colour scheme and a sound switch.
5. Account, New org and Sign out.

The account modal is gone; `/account` still draws the full sheet.

## The view dial

The View button's views sit on a quarter arc round it, from its left to
straight above it, and fly out from its centre. The centre still steps one view
a click.

## Motion that does not wobble

- Things arrive on a soft ease-out with no overshoot. The spring is kept for
  the smallest marks.
- The modal has no backdrop blur, which made it stutter over a full board, and
  opens with one short scale-in instead of three stacked motions.
- A chip turning on breathes instead of bouncing.
- A card opening its task grows into the sheet through a shared view
  transition, while the board behind holds still.

## Sound

The app makes small, quiet sounds, drawn from Strudel's synth engine,
`superdough` (`app/sound.ts`):

- **tap** for any control.
- **pick** for a chip or box turning on.
- **done**, a three-note chime, for a finished task.
- **open**, **close**, **slide**, **add**, **undo**, **error**, and **scheme**,
  an airy sweep for a change of light.

One listener on the document plays tap and pick, so no control needs code of
its own.

The engine is imported on the first press, about 45 KB gzipped, and nothing
plays until it has loaded. Sound is on by default. The You panel mutes it, and
the browser remembers that under `tusker:sound`. A person who asked the system
for less motion hears nothing.

### Licence

`superdough`, like all of Strudel, is AGPL-3.0-or-later. Serving it to people
over a network obliges the service to offer them its source. That is a
decision for `main`, not for this sandbox. The engine sits behind one module,
`app/sound.ts`, so swapping it for plain Web Audio, or another engine, touches
that file alone.
