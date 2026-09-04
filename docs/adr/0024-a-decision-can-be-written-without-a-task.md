# A decision can be written without a task

ADR-0010 hangs the decision prompt off a finish, and says a forgotten mark is
the right way to be wrong: somebody decides something on a task they never
marked, gets no prompt, and the record is lost.

Ticket #158 says that cost is too high. Some decisions have no task at all —
one made in a call, one made before the work started, one nobody wrote down.
The log had no way in for those, because the only door was a finish.

So the log takes a decision box: a title, a rationale, and a row with
`task_id` NULL. The person who posts is `decided_by`, and the org is the one
the page is scoped to.

## The prompt does not change

The prompt still hangs off the finish, still asks only about marked tasks, and
still keeps its once-only guard. That guard is a guard on a task: it asks
whether a decision already names the task, so a form posted twice writes one
row. A direct write has no task, so the guard has nothing to read.

That is why the write is a function of its own, `recordDecision()`, and not a
flag on `decide()`. Both reach the table through one insert, so the row is the
same row either way.

The box is a plain form, and the answer is a redirect to the log itself. A
refusal carries the words the person typed, so a browser with no script puts
them back.

## Consequences

A forgotten mark is now recoverable, and a decision that no task produced has
a place.

The log is no longer read-only, so a decision can be written by hand at any
time. Nothing checks that a hand-written decision is one: the box takes what
it is given, as the prompt does.

Two doors write the same table, so a reader of the log cannot tell which one a
line came through, apart from the task the line names. That is what the log
already showed for a decision whose task was deleted.
