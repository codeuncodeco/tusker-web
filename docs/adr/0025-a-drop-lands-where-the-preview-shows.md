# A drop lands where the preview shows

Amends [ADR-0015](./0015-a-drop-names-a-column-not-a-place.md): its sections
"Why the column and not the gap" and "Where the card lands" are replaced by
this record. The rest of ADR-0015 stands: the keys, the empty cursor and the
`move` intent.

Ticket #166 (split from #162) asks for a live preview of where a drag will
land, on both boards and in plan mode. The drag was native HTML5 drag and drop.
It drew no preview, and it did not work on a touch screen.

## The drag

The drag is `@dnd-kit/core` 6.3.1 and `@dnd-kit/sortable` 10.0.0, the versions
Payload's admin UI uses for its row drag. One module, `app/drag-lists.tsx`,
holds it for all three surfaces, and `app/drag.ts` holds the arithmetic, so it
is tested without a pointer.

While a card is dragged, the other cards make room, and the card itself stays
faded in the place it will land. A copy of the card follows the pointer. That
copy is drawn outside the columns, because a column scrolls, and a card dragged
out of a scrolling column is clipped.

A mouse drags after it moves five pixels, so a click on a card still places the
cursor. A finger drags after a 200 ms hold, so a swipe still scrolls the
column. The pointer sensor is not used, because it takes the touch before the
touch sensor can, and then a swipe never scrolls.

No key drags. The keys of a keyed list do not change.

## Where the card lands

**Org board.** The drop writes `before`, the card just below the preview, or
`null` at the bottom of the column. This order is stored, so the card stays
where it was dropped. The server contract does not change.

**Unified board.** The drop writes the status, and a place in the card's own
org column: above the nearest card **of the same org** below the preview, or
the bottom of that org's column when there is none. A card of another org
names no place, because a place is stored inside one org's column. The server
reads `before` inside the card's own org, so a `before` of another org lands at
the bottom, the same as `null`.

After the reload, percentile order draws the card. It can sit a little away
from where it was dropped.

**Plan mode.** A row of the plan drags. The drop posts a new intent, `place`,
with the row it lands above, or none for the foot. It goes through the route
the steps use, and a day read back refuses it as it refuses a step. The shelf
below the plan does not drag: its order is not the plan's.

A drop into Done still finishes the task and raises the decision prompt for a
marked task, as the select and the keys do.

## Why the gap and not the column

ADR-0015 refused an insertion line on the unified board, because percentile
order would not keep the place it drew. That is still true. What changed is
that the drop now writes a place the order can use. The place inside the
card's own org column is the input percentile order reads, so a drop moves the
card towards where it was dropped, even when it does not land there exactly.

ADR-0015 also refused one gesture with two meanings. This record gives the
gesture one meaning on every surface: the card lands above the nearest card
below it that shares its order. On the org board and in the plan, every card
shares it. On the unified board, the cards of the same org share it.

The cost is that the unified board can draw the card a little away from the
drop. We accept that cost, because the alternative — a drop that names a
column only — gives a person no way to say "near the top" at all.

## Consequences

The unified board's `move` takes an optional `before`. The keys still send
none, so a card a key moves lands at the bottom of its org, as before.

The org board and the unified board now write a drop by one rule, so the note
in ADR-0015 that "the missing insertion line is what tells a person which board
they are on" no longer holds. The org chip on a unified card tells them.

The arrow buttons in plan mode are now a second way to do what a drag does.
Removing them is #167.

A redirect that raises the decision prompt now goes to the page, and not to
the page's data address (`/me.data`). A fetcher posts to that address, so a
drop into Done answered with a 404 before this change. The keys had the same
fault.
