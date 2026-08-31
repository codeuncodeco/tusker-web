# ADR-0010: The mark decides who is asked, and the log is the guard

## Status

Accepted.

## Context

A decision is a record of what was decided, kept by the org. Finishing a task
is when the reasoning is still in the person's head, so that is when Tusker
asks.

The first shape asked on every finish. That is wrong. Most tasks decide
nothing: a task is a chore, a bug, an errand, and the prompt on top of it has
no answer. A prompt with no answer is one people learn to dismiss, and a prompt
people dismiss is how a log goes empty. The rate of the ask, not the shape of
the box, is what decides whether the log holds anything.

The first shape also counted the ask, in a `tasks.decision_asked` flag. That
made a skip permanent: a person who pressed Esc had no way back to the prompt,
and the words were lost until the log grows an editor.

## Decision

A person marks a task as one that holds a decision, in `tasks.decides`. It is
off by default. The prompt is raised when the mark is on, and the move lands in
Done, and no decision names the task.

The mark goes on when the task is made, in the board's quick-add box, while the
thought is still there. A task made before the thought landed is marked on the
task page, which is also where the mark comes off.

Nothing records the ask. The `decisions` table is the once-only guard: a task
that already holds a decision is not asked again, and one that holds none is.
A skip is therefore a not-now. The prompt returns the next time the task is
finished, and a person who wants it gone unmarks the task.

The prompt lives in the query string, as `?ask=<task>&org=<slug>`, and not in
the answer of the post that finished the task. Every way of finishing therefore
reaches the same prompt — a board card, the task page, the unified view, focus
mode — and each page raises it with one component. A reload before the person
answers raises the same prompt again, because the place is still in the address.

That query string is a place, not a permission. The read behind it is the same
one the finish makes: the org holds the task, the mark is on, the task is Done,
and no decision names it. A person cannot type an id into the address bar to
raise a prompt that was never due, and a form posted twice writes one decision.

## Consequences

Tusker asks rarely, and asks about the tasks a person said were worth asking
about. The log fills with decisions instead of with empty rows.

The cost is that the mark can be forgotten. A person who decides something on a
task they never marked gets no prompt, and the decision is not written. That is
the right way to be wrong: a missing record is recoverable, and a log nobody
reads is not.

A skipped prompt comes back. That is a nag on a marked task, and it is the nag
the person asked for by marking it. Unmarking the task ends it.

`decides` is the only column this adds to `tasks`. The table that holds the
answer is the same table that says the question is settled, so the two cannot
disagree.

A finish answers with a redirect rather than with data. Every finishing route
therefore hands back a `Response`, and a fetcher that posts one follows it.
