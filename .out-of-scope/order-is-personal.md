# A personal order over the board

Tusker gives a column one order. It is the org's, it is the stored `position`,
and any member can change it. A person cannot hold their own order of a column
on top of it.

## Why this is out of scope

The design once said the opposite. ADR-0003, "Order is personal, over a shared
position", gave each person a `rank` for a task they dragged, and the board read
`COALESCE(rank, position)`. Ticket #6 built it: a `task_ranks` table, the
interleaved read, a marker on a card whose rank put it somewhere other than the
board did, and a per-column reset.

Ticket #30 then asked for the keyboard path to that personal order, because the
arrows and the column select wrote the board's order alone. The ticket is what
showed the cost. Two orders need two paths on every surface, and each path needs
a label, because a person has to read which order an arrow writes. On a marked
card the two paths point at different neighbours, so one pair of arrows moves the
card past cards that sit nowhere near it on screen, and the other pair moves a
card the person cannot see move. Every later surface — the plan, focus mode, the
cross-org list — pays the same tax again.

The argument in ADR-0003 was real: two members will disagree about what comes
first. The answer is not a second order. It is that a person's own order lives
in the **plan** — the tasks they chose for a day, in the order they mean to work
them. The plan already holds tasks from several orgs, which the rank never could.
The board stays the org's, and the last member to drag wins.

ADR-0006, "One order per column", supersedes ADR-0003 and carries this
reasoning.

## What this does not reject

- The **plan**, which is one person's own order and stays
- **Percentile order**, the rule that sorts the cross-org list from a task's
  fractional place in its own column
- A **filter** or a **view** that hides other people's tasks, which is a
  different request

## Prior requests

- #6 — "Personal rank over the shared order"
- #30 — "A keyboard path to the personal order"
