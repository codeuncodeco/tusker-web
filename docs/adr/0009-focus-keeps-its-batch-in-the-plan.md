# Focus keeps its batch in the plan

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
  act on them — a finish or a drop — writes them as today's plan. From then on
  the day has a plan and the rule above holds.
- When the plan holds no unfinished task, focus offers three more, and taking
  them appends the next three of the unified view to the plan. It is an act with
  a key, never automatic: the end of a batch is where a person stops.

## The drop

Ticket #38 asks whether a person can take a task out of a batch without
finishing it. With no escape, one blocked task freezes the day. With a free one,
the batch is a suggestion.

So focus has a drop, and the drop costs something: it moves the task to the end
of today's plan. The task is not finished, not unplanned and not hidden. It
comes back, last, after the work the person still means to do today. A person
can clear a blocker; they cannot skim a plan by pressing one key three times.

## Consequences

Working in focus makes a plan, so `/me` shows that work under Today and stops
offering to plan the day. That is honest: the person did choose those tasks,
task by task, and the plan is where a person's own order lives (ADR-0006).

A drop out of a plan no longer than one batch moves the task to the end of that
same batch, because the end of the plan is inside it. Taking three more brings
work in front of the dropped task, which is the escape.

A plan of fewer than three unfinished tasks is a batch of what there is. An
empty plan says so, and offers the day.
