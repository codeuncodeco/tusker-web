# A sweep writes one org at a time

The unified board's Done and Cancelled columns carry a sweep, as the org
board's do. A column of that board holds cards of every org the person belongs
to, so one press can archive work of three orgs at once.

The write stays one org wide. The action groups the ids by the org slug each
card posted, mints one scope per org, and calls the same archive write once per
org, in sequence.

## Why not one write across the orgs

`org_id` is the only fence between two orgs, and every task write carries it.
See [ADR-0001](./0001-tusker-owns-every-task-row.md). A write that took a list
of ids and no org would have to prove membership itself, in a second place, and
a sweep is the widest act Tusker has: it is the one act with no per-card
confirmation.

So the sweep changes the caller and not the write. `archiveTasks` is what the
org board always called, `org_id` in its WHERE clause and all. The cross-org
part is the grouping above it.

Every scope is minted before anything is written. An id whose slug the person
cannot reach is a 404, and it is a 404 before the first org is touched: a
malformed list writes nothing at all, rather than archiving the orgs ahead of
the bad one.

## What a half-run leaves behind

The orgs are written in sequence, and D1 has no transaction across them. If one
org's write fails, the run stops there.

The sweep then reports exactly the ids it changed, and the toast says one org
did not answer. The undo names those ids, so a partial sweep is undoable on the
same terms as a whole one.

Nothing rolls back the orgs that succeeded. A rollback is a second write that
can fail as well, and it would leave the person with no account of what
happened. The ids that changed are a true account, and the undo is a button
they already know.

## The toast names the orgs

There is no cross-org archive screen. An archive is one org's, at
`/o/:slug/archive`, and this decision does not add a screen above them.

So the toast links to the archive of every org the sweep touched. A toast goes
by itself and a reload loses it, which makes the link the one moment a person
is told where the work went.

## No key

The sweep is a button on both boards, and no key binds it. It is the one act
with no per-card confirmation and the widest reach. The button is the right
amount of friction: a person points at the column they are looking at.

## Consequences

The control and its toast are one module, `app/column-sweep.tsx` and
`app/sweep.ts`, which both boards draw. The org board behaves as it did.

Every card posts its org slug beside its id, on both boards. The org board
names one org over and over, which costs nothing and keeps one wire format.

The unified board's action reads the ids and the slugs as pairs, so a form that
names a different number of each is a 400: a sweep that guessed at the pairs
would archive a task of the wrong org. The org board reads the ids alone. Its
org comes from the address and the slugs say nothing it does not already know,
so it answers as it always did.

The undo runs the same way and can stop part way as well. It answers with what
it put back, and the toast that posted it says one org did not answer and asks
for a second press: the ids it names again are the ids still archived.
