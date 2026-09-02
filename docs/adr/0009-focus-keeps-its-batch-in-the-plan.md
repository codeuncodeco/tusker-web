# Focus keeps its batch in the plan

Amended by ticket #103. The drop is gone. Every key a list binds now rides on
a control, and focus mode draws no Drop button to carry `d`. "The drop" below
argued that with no escape one blocked task freezes the day; the answer now is
that a batch of three is small enough to finish or to leave, and the plan is
edited in plan mode. Focus mode has one way out: finish.

Amended by [ADR-0014](./0014-the-week-is-a-set-and-the-day-is-a-plan.md). With
no plan, focus draws from the week set first, and from the live set only when
the week holds no set. Leftovers are a week rule now, so the last consequence
below no longer says anything: a day carries nothing to offer. Everything else
stands, and the list this ADR calls the unified view is the live set.

Ticket #38 asks focus mode to hold a batch still: the next three appear only
when the batch holds no unfinished task, and a person who leaves and comes back
reads the same three. It also asks focus to work with no plan, drawing from the
unified view.

Those two pull against each other. The unified view holds live tasks, so a task
finished in focus leaves the list, a fourth task slides up into the batch, and
the batch a person came back to is not the one they left. Holding a batch needs
memory, and Tusker keeps no second store (ADR-0004).

The memory it already has is the plan: the tasks one person chose for one day,
in the order they mean to work them (ADR-0008). A batch is the same statement,
three tasks long. So focus stores nothing of its own.

- With a plan, focus cuts the plan into threes from the top and works the first
  three that hold an unfinished task. A finished task keeps its place in the
  batch, struck through, so no task slides up.
- With no plan, focus draws the first three of the unified view and the first
  finish on them writes them as today's plan. From then on the day has a plan
  and the rule above holds.
- When the plan holds no unfinished task, focus offers three more, and taking
  them appends the next three of the unified view to the plan. It is an act with
  a key, never automatic: the end of a batch is where a person stops.

## The drop

Removed by ticket #103. The argument stands as it was made.

Ticket #38 asks whether a person can take a task out of a batch without
finishing it. With no escape, one blocked task freezes the day. With a free one,
the batch is a suggestion.

So focus has a drop, and the drop costs something: it moves the task to the end
of today's plan. The task is not finished, not unplanned and not hidden. It
comes back, last, after the work the person still means to do today. A person
can clear a blocker; they cannot skim a plan by pressing one key three times.

## What this overrides in the ticket

Ticket #38 asks for "the first three unfinished plan tasks". A batch cut from
the top is not always that: a plan of `[a done, b, c, d]` gives `a, b, c`, with
`a` struck through, and not `b, c, d`. The two rules agree while the person
works in focus mode, and part only where a task was finished somewhere else.
Stillness wins, because it is the rule the ticket asks for twice: the next three
appear only when this three are done, and a person who comes back reads the same
three.

Ticket #38 also puts "changing the plan from inside focus mode" out of scope.
Focus does not let a person edit the plan — there is no pick, no reorder and no
unplan on the screen — but the writes above do change the row. Holding a
batch with no store to hold it in is not possible, so the exclusion is reopened
here rather than worked around.

## Consequences

Working in focus makes a plan, so `/me` shows that work under Today and stops
offering to plan the day. That is honest: the person did choose those tasks,
task by task, and the plan is where a person's own order lives (ADR-0006).

A plan of fewer than three unfinished tasks is a batch of what there is. An
empty plan says so, and offers the day.

A person who starts the day in focus mode gets no leftovers offer, because the
first act writes a plan and plan mode offers leftovers only to a day with none.
The work they did is the day they started.
