# Order is personal, over a shared position

In the extension one person used the board, so position was truth. With several
members in an org, an ordered list needs an owner. Two members will disagree
about what comes first, and the cross-org list cannot use any single org's order,
because a fraction in one org's column means nothing against a fraction in
another.

A task therefore keeps a shared `position` that any member can drag. A person who
drags a card in their own view writes a `rank` for that task only, in the same
fraction space. The order a person sees is `COALESCE(rank, position)`, so ranked
and unranked tasks interleave, and a person who never drags sees the org's order
exactly.

A personal rank sticks. If a teammate later moves the shared position, the card
keeps its rank, shows a marker that says it differs from the board, and a
per-column action resets it. The alternative, where a shared drag clears the
rank, lets one member undo another's order without knowing.

The personal order has a boundary, and the column is it. A rank orders the cards
inside one column. The column a task sits in is the org's, because a status is a
fact about the work, not a view of it. So a drag inside a column writes a rank,
and a drag into another column writes the shared position. One gesture therefore
moves the board for every member, and the person doing it can see the card cross
a column edge as they do it.

## Consequences

The cross-org list sorts unranked tasks by their fractional place inside their
own column, then by due date. A personal rank overrides that as usual.

The word "priority" stays out of the product. Order is the priority.
