# A delete keeps the row, out of reach

Ticket #220. Until now the only delete Tusker had was **Undo an add**
(ADR-0012), so a task made by mistake could only be cancelled or archived, and
it stayed on the archive screen for good. The task aside now carries Delete.

## The row stays, and Tusker never shows it

A deleted task gets a mark on its row and leaves every page: the boards, plan
mode, focus mode, the week page, the archive screen and the decision log.
`/t/<n>` gives it the same 404 as a task that never was (ADR-0030). Tusker has
no restore and no trash page. A person with direct access to the database can
clear the mark, and that is the only way back.

A hard delete was the obvious path, and ADR-0012 took it for the undo. It was
rejected here because a delete from the task page can hit a task with weeks of
description, fields and assignees behind it, and one wrong click would lose all
of it. A visible trash was rejected too: Archive already means "out of the way
but kept", and a second kept-but-hidden state would make every reader ask how
the two differ. So the row is kept for the operator, not for the person.

## What a delete takes, and what it keeps

A delete takes the task out of every plan and every week set, past ones
included. That breaks the rule that a week set is never rewritten after its
week, and the rule now names delete as its one exception. Taking the rows out
means no read of a plan or a week set has to know about deleted tasks. The cost
is that a restore from the database brings back the task alone, not its place
in any plan or week.

A delete keeps the assignees, the org's field values and the decision's link
to the task. The decision log draws a decision whose task is deleted the same
way it draws one no task produced (ADR-0024): no link and no title.

## Who, which and how

Any member of the task's org may delete it, as any member may archive it. Any
task can be deleted, whatever its status, archived or not, because a mistake
can be found late.

Delete asks first, inside the aside: the button becomes a confirm with Delete
and Keep, and only the second click writes. The page then goes back to the
task's **Origin**. An undo line was rejected because the origin can be any of
five pages, and each would have to draw it. Delete is a button in the aside
and nothing else: no key on the task page and no key on a card. ADR-0026 lets
an act be reached by a button alone, as Archive is, and delete is the last act
that should be easy to hit.

## Undo an add stays a hard delete

The rows an add writes are seconds old, and a person undoes them because the
org was wrong. Nothing in them is worth keeping, and a kept row in the wrong
org is the failure ADR-0012 was written to prevent. So the undo still removes
its rows for good, and the glossary no longer calls it a delete.
