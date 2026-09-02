# A cross-org add starts personal

`/me` is one person's tasks across every org they belong to. A task belongs to
one org and never to two, so a quick-add box on that page must name an org that
the page itself does not hold. The board has no such problem: the org is the
page, and the column is the only choice left.

The obvious answer is to remember the last org a person added to. It is also
the wrong one, because the two mistakes it allows do not cost the same. A task
that lands in the personal org by accident is private. Nobody sees it, and the
person finds it in their own list. A task that lands in a team org by accident
appears on the board of every member, in their column order, and they cannot
tell that it was a slip. Tusker has no way to move a task between orgs, and it
will not gain one: a task carries the custom-field values its org declared and
the reference ids its org app owns, so a moved task holds values that no org
answers for.

So the picker starts at the personal org each time a person opens Tusker. The
pick then holds while they stay in the app, across the move from `/me` to
`/me/plan`, and it dies on a reload or in a new tab. The state lives in memory
in the root layout, which gives that lifetime with no expiry code and no stored
row.

A team org also draws a chip above the input, `Adding to blrhikes`, for as long
as the box holds that org. The placeholder is not enough on its own, because it
disappears at the first keystroke, which is when the risk starts. The personal
org draws no chip, so the quiet case stays quiet.

## Considered and rejected

**Remember the pick across loads, per person.** It makes the common case one
keystroke shorter and puts an hour-old choice behind a box that a person types
into without looking. A person who adds several tasks to one org is better
served by that org's board, where the org is the page.

**Name the org in the title, as `blrhikes: fix the map`.** It turns a tenancy
boundary into parsing, with a colon in a real title and an unknown slug as the
failure modes.

**Confirm each team-org add.** A prompt on every add is one that people learn
to dismiss, which is the failure ADR-0010 records for the decision prompt.

## The undo is a re-file

An add answers with an undo line that stays until the next add, a dismiss, or
the end of the page. Undo deletes the row, drops it from the day's plan, and
gives the box back the title and the decision mark, with the picker reset to the
personal org and holding focus. A person uses undo when the org was wrong, so
undo that only deleted would make them type the task again.

That delete is a hard delete of a row made seconds ago, and it is the only
delete Tusker has. Archiving instead would leave a real row in a team org that
its members can find, which is the failure this whole ADR sets out to prevent.

The box takes a pasted list, so one add can make many rows (#23). One add is
still one act: the undo line counts what the add made, and the undo deletes
every row of it, drops them all from the day's plan, and gives the box back the
whole text as it was typed. A partial undo would leave a person guessing which
rows survived. A cap of 100 lines bounds the worst paste, so the row this
delete must answer for is always a block a person can still see.

## Consequences

A person adding to a team org picks it once per visit. That is the price of the
rule, and it is paid in the place where the mistake is cheapest to prevent.

A person who belongs to no team org sees no picker and no chip. The box is a
title and a mark, and the org is implied.

`/me/plan/:day` for a past day carries no box. A plan is never rewritten after
its day, so a control that adds to it would not keep its promise.
