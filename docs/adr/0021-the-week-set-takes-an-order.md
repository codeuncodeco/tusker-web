# The week set takes an order

Amends [ADR-0014](./0014-the-week-is-a-set-and-the-day-is-a-plan.md). The week
set is still membership plus no day, and every other rule there stands. What
changes is one sentence: the set now carries an order of its own, and every page
that draws it draws it in that order.

ADR-0014 refused the order, and the refusal it leaned on is
[ADR-0006](./0006-one-order-per-column.md), which priced a second personal order
and turned it down. Two orders of the same list need two paths on every surface,
and each path needs a label, because a person has to read which order a control
writes.

That price is real, and it is not paid here. No surface carries two orders. The
board is the column's order. Plan mode is the plan's, and it reads the week
order without writing it. The week page has no other order on it, so a step
there is unambiguous and needs no label to tell it from another.

## What the percentile could not answer

A week set is long enough that "what comes first" is asked on Monday, not only
on the day. Until now the answer was percentile order: a task's fractional place
inside its own org column, over that column's length.

That number compares nothing across orgs. It says a task is a third of the way
down a column of twelve, and the column beside it belongs to a different team
with a different length and a different meaning. So the top of the week page was
arbitrary — and the top of a list is the one place a person reads.

## An act claims a place, a write-back only records one

Four rules say where a task lands, and they follow from one distinction: an act
made on a week page is a claim about the week, and a write-back from somewhere
else is a record of a fact.

- A hand pick, a pasted block and a carry land at the top. A pasted block keeps
  its typed order, first line topmost.
- The plan-mode write-back — picking a task the set does not hold — lands at the
  bottom. The plan already spoke for that task, so it makes no claim on the
  week, and it must not push down the work a person ranked.
- A carry keeps the order of the week it came from. Work ranked once is the same
  work, later.
- A finished member sinks under the live ones as the page draws, struck through
  and still counted. Nothing is written on a finish, so unfinishing a task
  restores its rank, and Friday still says six of nine.

## What the schema says

`week_plan_tasks` gains `position REAL NOT NULL`, the same fraction space a
column uses. A promote takes one step past the first, a step swaps two rows, and
a removal renumbers nothing: a hole in a fraction space is not a hole in the
order.

Still no JSON array, and `week_plans` stays the parent row. The membership row
is what lets a task that leaves take its memberships with it, through the
`week_plan_tasks_task` index, and the parent row is still what makes an empty
set different from no set.

A set that exists reshuffles once. The backfill is `rowid`, which is the order
the rows were written. Copying the percentile window into the migration would
freeze one day's board shape into a file that can never change again.

## The key

`T` promotes the task under the cursor to the top. It joins `J` and `K` as the
family that moves a row, so it is one row in the key map and one guard: it binds
wherever a page owns an order, which is the week page and plan mode both. The
buttons draw beside the step buttons, because a key is part of the control and
not a sentence under the list.

`B` sinks the row to the foot, and it joined the family later (#156). This ADR
first said there was no demote, because the two things that go to the foot are
automatic. That reads the foot as a place the machine writes, and it is also a
place a person means: a plan of fourteen had no way to send row 2 out of the way
in one press. `B` is the same one row and one guard as `T`, and it is refused
where `T` is refused. Its button is disabled on the last ranked row, as `T` is
on the first.

There is still no move to a named place. That is a drag, and the order is a
statement about the week, not a coordinate.

## Consequences

The four landing rules and the draw-time sink all read as mistakes to someone
who does not see the reasoning. A finish looks like it should write a position,
and it must not: the rank is the person's statement about the week, and
finishing a task is not withdrawing it. A write-back looks like it should land
where a pick lands, and it must not: the two acts say different things.

A step reads past a finished neighbour to the live row behind it. The sink means
the drawn order and the stored order differ, and the row a person sees move must
be the row that moves.

Plan mode draws "This week" in week order and never writes it. Focus draws its
first three from the set in week order, so the batch is the work the person
ranked first and not the work one org column happens to lead with.

The Week chip still narrows a board and does not reorder it. A board holds one
order and it is the org's (ADR-0006). The chip says which cards to draw, and
never in what sequence.

A board still has no personal order, and there is no week order per org. The
week set is one list across every org, which is exactly what a column order
could never be.
