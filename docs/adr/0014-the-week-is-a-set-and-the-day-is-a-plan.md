# The week is a set and the day is a plan

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
membership. A set has no order, so no array: the ADR-0008 argument for the JSON
array was that a row per task would need a second order to keep it, and there is
no order here to keep.

Two tables and not one, because an empty set is not the same as no set — the
same distinction ADR-0008 draws for a day. The parent row means "this week was
planned", so emptying the set does not raise the leftovers offer again.

The week key is `YYYY-Www` and the browser names it, for the reason the day is
named there: an evening east of UTC would land on the wrong week.

## Consequences

Removing a task from a week set also removes it from that week's current and
future plans, because the invariant holds in both directions. Past days are
never rewritten.

A finished task keeps its membership, struck through. The set is what the person
committed to, so Friday can say six of nine. It also makes leftovers computable:
the unfinished members of last week's set.

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
from the week set, and the live set steps in only where the person started no
week at all. A week started and left empty draws an empty batch, and the page
says so, because an empty set is a statement and not a gap.
