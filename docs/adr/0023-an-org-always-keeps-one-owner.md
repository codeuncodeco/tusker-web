# An org always keeps one owner

The members page can take a member out and change a role. Both acts stop short
of one thing: they never leave an org with no owner. The last owner is neither
removed nor demoted, and the refusal says so.

## The org would still be there

Membership is the only permission check, per `CONTEXT.md`. An org with no member
is unreachable: no page can read it, and no page can add a member back to it,
because adding a member is itself an act of a member. The row stays, and its
tasks stay with it, per [ADR-0001](./0001-tusker-owns-every-task-row.md). So the
loss is quiet and total, and one press makes it.

The owner role is where the guard goes, and not the member count. An org with
several members and no owner is reachable, so nothing is lost, but the role
would then mean nothing: every page could still do every act. A role nobody has
to hold is a word on a screen. Making the last one immovable is what gives the
role a job.

## The cost

A person cannot always leave. An owner alone in a team org is stuck in it until
they make somebody else an owner. That is the price, and it is paid by the one
case where leaving costs the org its last reader.

The alternative, transferring the org as one act, is a screen Tusker does not
have and this decision does not add. The refusal names the way out — make
somebody else an owner first — so the two-step is on screen and not in a doc.

## Where the rule lives

In the statement. The delete and the update each carry the same clause, and it
is written once and shared:

```sql
(SELECT COUNT(*) FROM memberships WHERE org_id = ? AND role = 'owner') > 1
```

A read before the write would let two removals racing each other both pass, and
the org would end with none. The clause and the write are one act, so they
cannot.

A write that changes nothing is then read back: a membership still there means
the last owner, and a membership gone means the row went between the two. The
person reads which of the two it was.

## The last owner's row

That row draws no control. A button whose one answer is the same refusal teaches
nothing, so the row carries the sentence itself. The refusal is one string, and
the row and the write both read it, so a person who posts the form by hand and a
person who reads the page are told the same thing.
