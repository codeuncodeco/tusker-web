# The week is a set and the day is a plan

Amended by [ADR-0021](./0021-the-week-set-takes-an-order.md). The week set now
carries an order of its own, and every page that draws it draws it in that
order. The frame below stands: the set is still membership plus no day, the
leftovers rule is unchanged, and the two tables and the week key are still the
two tables and the week key. "The week says what, the day says when" is
overtaken, and that section records why; the passages the order touches say so
where they stand.

A plan is one day long (ADR-0008). Everything a person has not placed on a day
sits in the live set, which is To do and In progress across every org, so the
answer to "what am I doing this week" is either today's plan, which is too
small, or the live set, which is everything. Work piles on today and rolls forward.

So Tusker holds a second level: the week set, the tasks one person means to
finish in one named week. It is a peer of the plan, not a bigger plan.

## The week says what, the day says when

The week set carries no order. A plan is an order — the row is the sequence —
because the question a day asks is what comes next. The question a week asks is
what is in and what is out. An order at week scale is a placement in disguise,
and it would give one task three opinions about its sequence: the org column
(ADR-0006), the plan, and the week.

So the week set is membership and nothing else, and it draws in percentile
order, the rule the live set already uses.

**This answer changed.** The argument above is sound about the price of two
orders on one surface, and that price is still refused. What it got wrong is the
count: no surface carries two. The board is the column's order, plan mode is the
plan's, and the week page has nothing else on it. And the answer it gave — draw
the set in percentile order — turned out to answer nothing: a task's fractional
place inside its own org column compares nothing across three orgs, so the top
of the week page was arbitrary, which is the one place a person reads. The set
takes an order of its own. See [ADR-0021](./0021-the-week-set-takes-an-order.md).

## A shelf, not a fence

Plan mode draws the week set first and the rest of the live set below it.
Picking a task the set does not hold adds it to the set.

A fence — a day may only hold what the week holds — turns Tuesday's urgent
arrival into two chores, and people route around fences. The write-back keeps
what a fence was for: every task a plan holds is in that week's set, so the set
is a true record of the week, both what was meant and what arrived.

## It replaces the day's leftovers

Leftovers were a day rule: open plan mode on a planless day and it offered
yesterday's unfinished tasks. That rule existed because nothing else remembered
unfinished work. The week set remembers it now, and better: carrying a list from
day to day is the rolling pile the week set was built to end.

So leftovers move up. Each plan starts empty, and the person picks it from the
set. The offer is made once a week, not once a day.

## What the schema says

`week_plans` holds one row per started week. `week_plan_tasks` holds one row per
membership, and — since ADR-0021 — a `position` fraction on it. Still no array:
the membership row is what lets a task that leaves take its memberships with it,
and a fraction keeps the order without one.

Two tables and not one, because an empty set is not the same as no set — the
same distinction ADR-0008 draws for a day. The parent row means "this week was
planned", so emptying the set does not raise the leftovers offer again.

The week key is `YYYY-Www` and the browser names it, for the reason the day is
named there: an evening east of UTC would land on the wrong week.

## Consequences

Removing a task from a week set also removes it from that week's current and
future plans, because the invariant holds in both directions. Past days are
never rewritten.

A finished task keeps its membership, struck through, and sinks under the live
members as the page draws. The set is what the person committed to, so Friday
can say six of nine. It also makes leftovers computable: the unfinished members
of last week's set.

A carried task is in two sets at once, because the old week is never rewritten.
Membership is therefore always per named week, never a flag on the task.

The week runs Monday to Friday on the week page. The five days are a fact about
that page, not a rule in the data: a Saturday plan still works if a person
addresses the day.

The Week chip reads as the Today chip reads, board by board. The org board
draws it whether or not the week holds a set, because a chip that comes and
goes teaches nobody the feature exists (ADR-0011); with no set it is a way to
the week page and not a filter. The unified board draws it only where the set
holds a task, as it draws Today only where the plan holds one: that page sits
under the header that already carries Week, so a chip that narrows nothing
teaches nothing there.

Focus reads the same distinction the two tables draw. With no plan it draws
from the week set, in week order. The live set steps in only where the person
started no week at all. A week started and left empty draws an empty batch, and the page
says so, because an empty set is a statement and not a gap.
