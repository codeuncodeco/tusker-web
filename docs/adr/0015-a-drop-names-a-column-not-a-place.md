# A drop names a column, not a place

Extends [ADR-0006](./0006-one-order-per-column.md).

The unified board takes a drag between columns. The drop target is the whole
column, no insertion line is drawn between cards, and the drop writes `status`
and nothing a person could call a place.

The org board had no drag at all. `CONTEXT.md` and three source files said so
and cited ADR-0006, but ADR-0006 argues about **order**, and a move between
columns is a **status** change. The card already carried a `<select>` that made
the same write. So the org board banned a gesture no decision had refused, while
offering the same act by another control.

## Why the column and not the gap

A card's place in a unified column is percentile order: a fractional place
inside its own org column, with the due date breaking a tie. It is derived and
it drifts between loads. Drop a card third from the top and it will re-sort
somewhere else. An insertion line would promise a place the page cannot keep.

The alternative was to let a drop write the org's shared `position` when the
card below it belongs to the same org, and fall back to a column drop when it
does not. That is one gesture with two meanings, and nothing on screen says
which one a person is about to get. ADR-0006 priced exactly that — two paths on
every surface, each needing a label a person must read — and refused it. The
same reasoning refuses it here.

So the drop is coarse on purpose. It answers "which column", the one question
this board can answer honestly, and the plan stays the place a person says what
comes first.

## Where the card lands

`moveTask` runs with `before: null`, which puts the card at the bottom of its
own org's column for the new status. It is what the org board's column drop
already writes, so a person who drags on either board finds the card in the same
place on the other.

The card then draws where percentile order puts it, which is usually not where
the pointer let go. That is the cost of the decision, and it is smaller than the
cost of teaching a place the board will not hold.

## The keys are the first way

Tusker is keyboard first, so a gesture with no key is a gesture the codebase
does not want. `>` and `<` step a card along **Backlog -> To do -> In progress
-> Done** and stop at both ends. They post the `move` intent the drop posts.

Cancelled is off the run. It is an outcome and not the next step, so it costs a
drag or the select. Backlog is on the run, and `<` reaches it even when the
Backlog column is hidden — the key follows the workflow, not the toggles, and
the card leaves the screen.

The keys go to the unified board, plan mode and the week page. Focus mode keeps
its two keys: the mode narrows what a person can do, and that is the point of
it.

## The cursor can be empty

A click on a card places the cursor, and so the page had to start it somewhere.
It started on the first card the page drew, which named a card at every person
who only came to read. Nothing they had done chose that card, and the page had
no way to un-choose it.

So the cursor now starts empty, and `Escape` empties it again. `j` and `k` fill
it from outside the list: `j` takes the first card and `k` the last, which is
the way each key already walks. Every key that needs a card — `Enter`, `x`,
`p`, `>`, `<`, `J`, `K` — answers nothing while the cursor is empty, because
the guard that reads the card already refused a cursor that named none.

The alternative was to keep the first-card start and let `Escape` clear it. It
costs one press to undo a choice the page made for the person, on every load,
and it leaves the read-only case wrong until they press. A start with nothing
named says what is true: no card has been picked.

The empty state also catches the card the page stops drawing. The cursor named
that card, the card is gone, and the first card it used to fall back to is a
card nobody picked — the same wrong the start had. So the cursor empties, and
the next `j` starts at the top. It costs one press after a finish, and it buys
one rule for what the cursor names: a card a person picked, or no card.

Every keyed list takes this — both boards, plan mode, the week page and focus
mode. The cursor is one idea and one name, so a page that started it differently
would be a page a person has to learn twice.

`Escape` is the press because it is what the rest of the app means by "out": it
leaves the quick-add box, it shuts the header menu, it skips the decision
prompt. A cursor that already names no card answers nothing, so the press falls
through to the menu and the prompt as before.

The clear is the one act with no control beside it. Every other key rides on a
button, so no act is reachable by key alone (ADR-0016). A cleared cursor names
no card, so there is no card for a button to sit on, and a button on the page
chrome would name an act most people never want.

## Consequences

A drop needs no server change. `/me` already served the `move` intent, so a drop
into Done writes the finish time and raises the decision prompt the way the
select always did.

A click on a card body now places the keyboard cursor. `>` and `<` act on the
cursor, and `j` was the only way to move it, so on a long column the keys would
have been reachable near the top and nowhere else. The cursor starts empty, so
a person who has neither clicked nor pressed a key has no card named at them.

The last member to drag still wins, with no merge and no lock, as ADR-0006 says.

The unified board and the org board now offer the same gesture and write it
differently: the org board's drop names a place, and this one names a column.
The difference is the derived order, and the missing insertion line is what
tells a person which board they are on.
