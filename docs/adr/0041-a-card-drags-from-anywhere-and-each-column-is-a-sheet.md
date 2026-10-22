# A card drags from anywhere, and each pulled-out column is a sheet

Built on the `ui-sandbox` branch. Amends [ADR-0025](./0025-a-drop-lands-where-the-preview-shows.md),
whose grip clause and its #182 amendment it replaces, and
[ADR-0038](./0038-the-board-takes-the-page.md), whose shared drawer it replaces.

## The whole card drags

A drag started from the six-dot grip at a card's left edge and nowhere else.
The grip is a small target, and it set the card's title in from its edge for
no reason a reader could see.

Now the whole card is the drag source: an org board card, a unified board
card, and a plan row that drags. The grip is gone. Movement tells a drag from a
click:

- **A mouse** drags once it has moved five pixels. A press that does not move
  is a click, as before: on the title it opens the task, on the ring it
  finishes it, and anywhere else it places the cursor.
- **A finger** drags after a hold of 180 ms with no more than 6 px of drift. A
  finger that moves at once is a swipe, and scrolls the column. The card draws
  `touch-action: manipulation`, so the browser still scrolls while the hold
  decides.
- The click a browser may fire as a drag lets go is swallowed, once, so a drop
  never opens a task or ticks a ring.
- A card that drags shows the grab cursor and selects no text under a drag. A
  row that does not drag shows neither.

The drag still makes no card a tab stop or a button, because the list holds
the focus and the keys move a card. No key drags.

### What it costs

This is where #182 started from, and it brings back the hold on a phone that
#182 removed. The hold is shorter than the 200 ms it was. The cost is accepted
for a drag that starts where the card is, rather than on a mark at its edge.

## Each pulled-out column is a sheet

Backlog and Cancelled pulled out into one drawer. With both out the drawer
split in two, and either tab moved to the drawer's edge as soon as either
column was out, so opening one moved the other.

Now each is a sheet of paper of its own (`SideSheet`):

- **Backlog** hangs from the top-left corner. **Cancelled** rises from the
  bottom-left corner.
- Each is as tall as its cards: no shorter than a drop target, no taller than
  the screen, and it scrolls inside.
- Each slides out on its own, plays its own sound, and goes away on its own
  ✕, tab or Escape.
- **Each tab rides its own sheet only.** Opening Cancelled leaves Backlog's tab
  where it is, and the other way round.
- **With both out they may overlap, as paper does.** The one opened or touched
  last lies on top.

An open sheet is still an address, `backlog=1` or `cancelled=1`, and a card
still drags between a sheet and the board.
