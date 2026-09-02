# The person axis and the org axis are peers

Tusker has no global chrome, so every page writes its own header. An audit
found three chrome patterns across fourteen pages, four unreachable or
near-unreachable routes, and a two-hop cost to leave an org from any page but
the board. Before a header can be designed, one question has to be answered:
which axis is the root?

Tusker holds two. The **person** axis is the unified view, plan mode and focus
mode: one person's tasks across every org they belong to. The **org** axis is
the board, the decision log, the fields, the members and the settings of one
org.

## Person-primary was the live alternative

The tidy answer is one root. `/me` is home, an org is a filter on it, and the
header is one bar with an org selector that changes what you see rather than
where you are. The board then is the unified view narrowed to one org, and
Tusker has one page instead of two.

It fails on the admin pages. An org does not only hold tasks; it holds fields,
members and settings. Those are not views of a person's task list at any
filter setting, so person-primary has no home for them. The test is to stand
on Acme's members page and press `Plan`. Under person-primary that move is
incoherent, because members was never a state of the person's list. Under
peers it is plain: you left one place and entered another, which is what
actually happened.

## So: peers

An org is a place, not a filter. The header draws both halves at once, always,
and marks the page you stand on. A task page stands in the org half, because a
task belongs to one org and never to two — the header says the true thing, not
the recent thing.

`app/routes.ts` gains three layouts to match: signed-out, person and org. The
route tree then carries the model instead of a convention carrying it, and the
org loads once per org page rather than in six route files.

## Consequences

The org half needs a subject while a person stands on a person page. That is
the **current org**, held in a session cookie and rewritten on every
`/o/:slug/*` visit, falling back to the personal org. Peers buy the one-hop
move from `/me` to any org page at the price of one piece of remembered state.
The state is visible: the org's name is printed in the header.

This is hard to reverse. It restructures the route tree, so a later move to
person-primary is not a header edit.

Two pages are peers, and the header is twice as wide as either half needs. On
a narrow screen the two halves have to stack or collapse, which a single-root
design would never have had to solve.
