# A plan commits as it is made

Ticket #36 describes plan mode as three acts: pick the tasks, order them,
commit. A commit at the end implies a draft in front of it — a list the browser
holds while the person builds it, written to `plans` only when they press the
button.

Tusker keeps no second store (ADR-0004). A draft is one: it lives where the
server cannot read it, it is lost when the tab closes, and a person who plans a
day on a phone and opens a laptop finds nothing. It also needs script to exist,
and every other act on the board and the unified view works from a plain form.

So plan mode writes the row on every act. A pick, a drop and a step each land on
the one `plans` row for that person and that day, and the next read gives the
plan back. Nothing is lost and nothing waits.

## Consequences

There is no Commit button, and no draft state. The person is never asked to
confirm a plan, because the plan is already theirs.

One `plans` row per person per day still holds, which is what the ticket asked
the commit to produce.

A person who picks a task and changes their mind takes it out again. That is one
more write, and writes are cheap: a plan is tens of rows a day, not thousands.

An emptied plan is not the same as no plan. The row stays, so the unified view
does not offer to start a day the person already started. A board carries the
Today chip only while the plan holds a task, because a chip that empties the
board narrows to nothing.

## Amended by ADR-0014

The week set holds unfinished work now, so leftovers are a week rule and a plan
starts empty every day. The rest of this ADR stands: the plan row is still
written on every act, and an emptied plan is still not the same as no plan.
