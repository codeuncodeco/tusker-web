# The mark decides who is asked

Ticket #39 asks Tusker to catch a decision while the reasoning is still in the
person's head. Finishing a task is that moment, so the prompt hangs off the
finish.

The first shape of the ticket asked on every finish. PR #51 built it, and it is
wrong. Most tasks decide nothing: a task is a chore, a bug, an errand, and a
prompt on top of one has no answer. A prompt with no answer is one people learn
to dismiss, and a habit of dismissing is how a log goes empty. What fills a
decision log is the rate of the ask, not the shape of the box.

So a person marks the task, in `tasks.decides`, and only a marked task raises
the prompt. The mark is off by default.

The mark goes on in the board's quick-add box, when the task is made and the
thought is still there. A task made before the thought landed is marked on the
task page, which is also where the mark comes off. Those are the two places a
person is already writing about the task.

## Nothing records the ask

The first shape also counted the ask, in a `tasks.decision_asked` flag set by
the move to Done. That made a skip permanent. A person who pressed Esc had no
way back to the prompt, and the words were gone until the log grows an editor.

The `decisions` table is a better guard, because it holds the answer. The
prompt is raised when the mark is on, and the move lands in Done, and no
decision names the task. Nothing else is written, so `decides` is the only
column this ticket adds to `tasks`.

That makes a skip a not-now. The prompt returns the next time the task is
finished, and a person who wants it gone unmarks the task. A task that already
holds a decision is never asked again, because the table says so.

The cost is a nag on a marked task. It is the nag the person asked for by
marking it, and one they can end in one click.

## The prompt is a place

The prompt lives in the query string, as `?ask=<task>&org=<slug>`, and not in
the answer of the post that finished the task. Every way of finishing therefore
reaches the same prompt — a board card, the task page, the unified view, focus
mode — and each page raises it with one component. A reload before the person
answers raises the same prompt again, because the place is still in the address.

That query string is a place, not a permission. The read behind it is the same
one the finish makes: the org holds the task, the mark is on, the task is Done,
and no decision names it. So a person cannot type an id into the address bar to
raise a prompt that was never due, and a form posted twice writes one decision.

## Consequences

Tusker asks rarely, and asks about the tasks a person said were worth asking
about. The log fills with decisions instead of with empty rows.

A mark can be forgotten. Somebody decides something on a task they never
marked, gets no prompt, and the decision is not written. That is the right way
to be wrong: a missing record is recoverable, and a log nobody reads is not.

A finish answers with a redirect rather than with data. Every finishing route
hands back a `Response`, and a fetcher that posts one follows it.
