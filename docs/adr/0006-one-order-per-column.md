# One order per column

Supersedes [ADR-0003](./0003-order-is-personal.md).

A column holds one order. It is the org's, it is the stored `position`, and any
member can change it. A person keeps no order of their own on top of it.

ADR-0003 decided the opposite, and its question was the right one: two members
will disagree about what comes first. The answer it gave was a second order — a
`rank` per person per task, read as `COALESCE(rank, position)`. Ticket 6 built
it, and ticket 30 then asked for the keyboard path to it. That ticket is what
priced the design.

Two orders need two paths on every surface that orders anything, and each path
needs a label, because a person has to read which order a control writes. On a
card whose rank moves it, the two paths point at different neighbours: one pair
of arrows moves the card past cards it does not sit beside on screen, and the
other moves a card the person cannot see move. The board, the plan, focus mode
and the cross-org list each pay that again.

The disagreement is real, so it needs an answer, and the answer is not a second
order of the same board. It is the **plan**: the tasks one person chose for a
day, in the order they mean to work them. A plan already holds tasks from
several orgs, which a rank inside one org's column never could, and it says
what a personal order actually means — not "my board is different" but "this is
what I am doing today".

## Consequences

The board is the org's. The last member to drag wins, with no merge and no
lock, which ADR-0004 already implies by making the server the truth. The
fraction space keeps a collision rare, and a lost drag costs one more drag.

The cross-org list sorts a task by its fractional place inside its own column,
then by the due date. Nothing overrides that any more.

`task_ranks` is not built. The word **rank** stays, and names the number a card
shows in its column, which is a place in the order and not a stored field.

The reasoning that keeps the feature out is in
[`.out-of-scope/order-is-personal.md`](../../.out-of-scope/order-is-personal.md).
