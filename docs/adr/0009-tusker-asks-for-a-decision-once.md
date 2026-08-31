# ADR-0009: Tusker asks for a decision once, on the move to Done

## Status

Accepted.

## Context

A decision is a record of what was decided, kept by the org. Finishing a task
is when the reasoning is still in the person's head, so that is when Tusker
asks.

A task moves in and out of Done. A person moves a card back to In progress to
finish one more thing, then moves it to Done again. A prompt raised on every
such move is a prompt people learn to dismiss, and a nag is how a log goes
empty.

The prompt can also be skipped. Esc closes it and the task is Done all the
same, because a decision nobody has words for yet is worth less than the task
being finished.

## Decision

The move that finishes a task records the ask, in `tasks.decision_asked`. The
prompt is raised when the move lands in Done and that flag is 0.

One flag covers both cases. A skipped prompt is not asked again, and neither is
a task that went out of Done and back, because the ask is what the flag counts,
not the answer.

The prompt is open only while the flag is 1 and no decision answers for the
task. The query string says which task the prompt is on, so that pair is what
the page reads, not the address alone: a person cannot type an id in to raise a
prompt that was never due, and a form posted twice writes one decision.

The prompt lives in the query string, as `?ask=<task>&org=<slug>`, and not in
the answer of the post that finished the task. Every way of finishing therefore
reaches the same prompt — a board card, a row of the unified view, the task
page — and each page raises it with one component. A reload before the person
answers raises the same prompt again, because the place is still in the address.

## Consequences

Tusker asks once per task, and never twice for one decision.

A person who skips the prompt has no way back to it from the task. The log takes
no decision without a task, so what is lost is lost until a decision can be
written straight into the log. That is the price of one flag, and it is the
right one while the log is the only screen a decision has.

A finish answers with a redirect rather than with data. Every finishing route
therefore hands back a `Response`, and a fetcher that posts one follows it.
