# The assignee filter names a member

Amends [ADR-0013](./0013-the-assignee-is-visibility-not-permission.md).

The org board's assignee filter is a select of the org's members: `Anyone`,
`Unassigned`, then each member in name order. It narrows the org board and
nothing else.

ADR-0013 drew the control as three fixed choices — mine, unassigned, everyone —
on the org board and the unified board both. The argument below stands. Two
parts of the answer changed.

## Why a member, not "mine"

"Mine" is one member: the person reading. A select of members already offers it,
under the reader's own name, so the fixed choice buys nothing and costs the
board a second vocabulary. One control, one question — *who holds this?* — and
every answer the org can give is in the list.

The question the board is asked is also not always about the reader. "What is
the new member sitting on" is asked more often than the design admitted, and
three fixed choices cannot answer it at all. The map the loader already builds
for the initials on every card holds every name, so the answer costs no query.

`Unassigned` stays a value of the same select, for the reason ADR-0013 gave: a
filter that offers "mine" alone hides untaken work from every person who turns
it on, and untaken work is the work that most needs a reader.

## Why the org board alone

The unified board spans every org one person belongs to. A member select there
lists strangers — people from an org the reader barely opens, named beside the
colleagues they work with daily, with nothing on screen to say which is which.
The select would be long, and most of it would be noise.

A `Mine` and `Unassigned` pair is the shape that could work there, because
neither names anybody. It is a later decision, taken when somebody asks for it,
and it is not this one.

So the two boards hold different controls, which ADR-0011 makes a cost worth
naming: the axes are peers, and a person who learns one board meets the other.
The cost is paid because the alternative is worse. A select that is right on one
board is wrong on the other, and drawing the wrong one for symmetry teaches the
person a control they cannot use.

## Where it narrows, and what it narrows with

In memory, over the map of assignees the loader reads for the whole org in one
go. The Today chip narrows the same way. No second query, and no join in the
task read.

The value rides the query string, as the search and the chip do, so a narrowed
board is a link and Back works. It joins the remembered narrowing beside the
search: a board opened bare comes back as the person left it.

It sets `narrowed`, so a finished column offers the sweep while the filter holds
a value. The sweep archives what is on screen and asks no question about which
control put it there. Sweeping one member's finished work is a real act.

## The silence stays keyed to the kind

A personal org draws no assignee, so it draws no filter. A team org draws both,
even while it holds one member. ADR-0013 said "an org of one member", which
reads as a count; the code has always tested the kind, and the kind is right. A
control that appears the day a second member joins is a control drawn by rule,
and the header's rule is that nothing is.
