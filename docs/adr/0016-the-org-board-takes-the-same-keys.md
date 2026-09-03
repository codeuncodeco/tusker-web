# The org board takes the same keys

Amended by [ADR-0022](./0022-a-keyed-lists-keys-are-live-where-focus-is.md).
The board's keys are now live only in the list that holds the focus, and the
letters below are read from `app/key-map.ts`. The two maps still stay apart:
what a press means on this board, and what it posts, is still this board's own.

Extends [ADR-0011](./0011-the-person-axis-and-the-org-axis-are-peers.md) and
[ADR-0015](./0015-a-drop-names-a-column-not-a-place.md).

The org board at `/o/:slug/board` binds the card keys the cross-org pages bind:
`j` and `k` move a cursor, `Enter` opens, `x` finishes, `n` adds, and `>` and
`<` walk the card between columns. It adds two of its own, `J` and `K`, which
step the card inside its column.

## Why

Tusker calls itself keyboard first, and that was true of the person axis only.
`/me`, plan mode, the week page and focus mode all bound keys. The org board
bound none: it had a drag, a `<select>` and buttons.

ADR-0011 makes the two axes peers, and the unified board is drawn as the org
board on purpose, so that a person who learns one meets the other. A person who
learned the board on `/me` met the same layout on an org board and none of the
keys. The layout promised something the page then refused.

The keys are the same letters because they are the same acts. Nothing here is a
new gesture: every key posts the `move` intent a control on the card already
posts.

## The two keys the org board has to itself

`J` and `K` step the card one place up or down its column, and they post what
the card's own two arrows post: the card, and the way.

Only this board can offer them. A column here is ordered by `position`, the
org's stored number, so a person can say what comes first and the board keeps
it. Every cross-org column is percentile order, which is derived, so `J` and `K`
have nothing to write there. That is ADR-0006, and it is why plan mode is the
one person-axis page that steps: the plan is an order a person owns.

So the gap between the two boards is now one pair of keys, and the reason for it
is the reason the boards differ at all.

## A step names no place

A step posts the card and the way, and the server reads the card it lands above
out of the column as it stands. The arrows used to send that place themselves,
read out of the order the page last loaded.

A key can be held. Two presses land before the first answer comes back, and the
page's copy of the order is then one load old, so the second press would name
the place the card already left and the card would stop after one step. The
arrows had the same weakness and no one could reach it by leaning on a button.

This is what the person axis already does: plan mode posts `up` and `down` and
the server resolves them. So the board now posts the same two intents, from the
keys and from the arrows, and the `move` intent keeps its `before` for the one
gesture that truly names a place: the drop between two cards.

## What `x` writes

Finishing is a move to Done, and the org board has no separate finish intent, so
`x` posts `move` with `done` and no place inside it. A card already in Done or
in Cancelled has nothing left to finish and the key does nothing, which is what
the Finish button on a cross-org row does.

## What the org board does not bind

**`p`, plan or unplan.** The org board draws no plan control at all. A key would
be the only way to plan from this page, and this codebase treats a key and a
control as two ways to one act, never a key alone. Planning from the org board
is a change to the page, not a change to its keys, so it stays out. The Today
chip still narrows the board to the plan, and plan mode is where a plan is made.

**`d`, drop from the batch.** Focus mode holds a batch. No other page has one.

**Cancelled on the run.** `>` and `<` stop at Done, here as everywhere.
Cancelled is an outcome, not the next step. See ADR-0015.

## Consequences

The keys that move a card between columns are client-side: `>`, `<` and `x` post
the `move` intent the select and the drop already posted, so the server learned
nothing from them.

The two step keys cost the board one server act, `up` and `down`, which resolves
the neighbour itself. The arrows post it too, so the board holds one way to step
a card and not two, and it still works with no script.

A click on a card body now places the cursor, as it does on the unified board. A
cursor that only `j` could move would put the keys near the top of a long column
and nowhere else.

The key map lives in `app/board-keys.ts`, beside `app/unified-keys.ts` and not
inside it. The two pages draw different rows and write different intents — one
posts a slug with every act and the other does not — and one file that served
both would be a switch on which page is asking. The letters are shared by
decision, and a test in `test/board-keys.test.ts` holds each map to it.
