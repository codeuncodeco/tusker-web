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

### Amended: tabs, no modal bar, one thing at a time

The first cut of this round drew three things too big or too busy. They changed
as follows.

- **The You panel has tabs.** It stacked five sections into one tall scrolling
  panel. Now it is a card of one size, 22 by 24 rem, a sheet of the same height
  on a phone. Four tabs head it as a segmented control, each a glyph over a
  small name:
  - **You**: who they are, then Account and Sign out.
  - **Boards**: every org, All, and New org.
  - **Org**: the org's six pages, three by two.
  - **Look**: the colour scheme, sound and keys.

  A tab switch swaps the section in place, so the card never jumps. The panel
  opens on the tab last used, kept outside the panel as the dial's state is.
  ← and → walk the tabs. With no script the `<details>` still opens and every
  section is drawn, stacked.
- **A modal has no header bar.** Back, Forward and ✕ are `ModalControls`, one
  small cluster that each page puts in its head tile, so the controls are part
  of the bento. A page that holds none still gets a lone ✕ at the modal's top
  right; it hides itself with CSS once the page's own controls are inside, so
  it works on a page drawn by the server too. The dialog keeps the page's name
  for a screen reader.
- **Search shows filters or answers, never both.** With the box empty the
  panel holds the board's filters, a row of chips each with no label or glyph,
  and a small ✕ that clears them. With words in the box it holds the answers:
  one flat list of at most eight rows, with no group headings or counts, and a
  muted hint at each row's right. "Narrow this board" is the last row on an org
  board. The panel is narrower, and the key hints at its foot are gone.

## The view dial

The View button's views sit on an arc round it and fly out from its centre.
The centre still steps one view a click.

*Amended.* The pills flew out 120 px, too far from the button they came from.
They now sit 84 px out and are the dock button's size, 48 px. To keep a gap
between them at that radius, the arc is a third of a turn, from the button's
left round to just past straight above it.

## Motion that does not wobble

- Things arrive on a soft ease-out with no overshoot. The spring is kept for
  the smallest marks.
- The modal has no backdrop blur, which made it stutter over a full board, and
  opens with one short scale-in instead of three stacked motions.
- A chip turning on breathes instead of bouncing.
- A card opening its task grows into the sheet through a shared view
  transition, while the board behind holds still.

*Amended.* That first morph was rough. It stretched the card's picture to the
sheet's size, and the shade popped in at once. The sheet also ran its own
scale-in inside the morph. Now it is a container transform:

- The card's box grows into the sheet's on the curve a sheet moves on, 380 ms.
  The box is solid paper with soft corners, and it clips what it holds.
- Neither picture is scaled. Each sits at its own size at the box's top left.
  The card fades out early, and the sheet fades in on the paper.
- The shade fades in over the board, which holds still.
- A sheet that grew from a card skips its own entry, so only the morph moves.
- **Closing runs it in reverse.** The sheet shrinks back into the card it grew
  from while the shade fades out. This holds only for the task that grew, and
  only while its card is on the page. Any other close is plain.

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
