# The org select scopes one board

ADR-0011 made the person axis and the org axis peers, and drew both halves of
the header at once. The org half needed a subject on a person page, so a cookie
held the current org, and a dropdown in row 1 changed it. #190 asked to take
that dropdown away and to let a filter choose which orgs the board draws. #43
asked whether the org board is the unified board with one org filtered. #181
asked for one header row.

## One board, two scopes

There is one board. A select in the header sets its scope: All, or one org.
All is the unified board at `/me`, and one org is the org board at
`/o/:slug/board`. The page is the same, and the address names the scope.

Inside one org, percentile order is the org's stored order, so the two scopes
already draw the same cards in the same order. What one org adds is what only
one org has: its stored order and `J` and `K`, the drop that writes the exact
place, the assignee filter, the field filters and the search. These come with
the scope and go with it.

The org board keeps its address. The org layout still proves membership, every
org page still sits under `/o/:slug`, and an origin that falls back to the
org's board still lands there. An org is still a place: ADR-0011 holds for the
route tree.

## The address is the only current org

The select reads the address. It names the org of an org page, and All on a
person page. The menu beside it holds the pages of the org the select names,
and none while it reads All, so a person on Plan picks an org before they open
its decision log. That is one hop more than ADR-0011 gave, and only on the way
from a person page to an org page.

A person in one org has nothing to pick, so the select is not drawn. That
person always stands in their one org: `/` and `/me` send them to its board,
and the menu always holds its pages. All and that org are the same tasks, and
the org scope is the one with the powers.

The current org cookie goes. It was the one piece of remembered state ADR-0011
paid for the org half, and with no org half it has no reader. The header now
cannot say an org the address does not say.

## Considered and rejected

**A filter on the board that picks any set of orgs.** This was the request in
#190, and a prototype built it. It is more granular, but the header then has no
org to name, so the menu has to list every org's own pages under its name, and
that menu grows by six rows per org. Two orgs out of five is a view nobody has
asked for in use. A board filter can still come later inside the All scope,
and nothing here blocks it.

**`/me?org=:slug`, with the org board redirecting to it.** One address for one
page is tidy, but it moves the board out from under the org layout and breaks
every link to an org board.

**Keep the last org in the select on a person page.** The menu then always has
an org, and the cost is a select that reads Acme above a board that draws every
org. The header would say the recent thing, not the true thing.

## Consequences

ADR-0011 is superseded where it draws the header: there is one row, not two
halves, and no current org. Its route tree stands.

The board's powers come and go with the scope. That is a control drawn by rule,
which ADR-0011's header refused. Here the rule is the select a person just set,
and the select stays in view.

On the board the select is the page's heading, inside the `h1`, so the heading
reads as the scope. Every other page keeps its own heading.
