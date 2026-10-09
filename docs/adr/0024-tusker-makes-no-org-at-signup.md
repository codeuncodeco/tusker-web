# Tusker makes no org at signup

Tusker used to make a personal org for every account, invited ones included. A
person invited into a team got a second org they never asked for, and the
personal org was a second kind of org that the members page, the assignee
picker, the switcher and the quick-add box each had to ask about. Now there is
one kind of org. Tusker makes none at signup, and an invited person starts with
the org that invited them. Orgs made before this keep their rows and become
orgs like any other.

## A person with no org asks to join one

The bootstrap page makes the first account and sends it to `/orgs/new`, because
an instance with no org has nothing to join. Anyone else who belongs to no org,
a person made by a script or one removed from their last org, lands on the org
directory and sends join requests from there. Any person may still make an org,
from a page of its own, but Tusker does not steer them there: an org made to
fill an empty page is one nobody else knows about.

A message that only named the instance owner was considered. It builds nothing,
but it sends every newcomer through one person's inbox, and a request that
lives in an inbox cannot be seen, withdrawn or answered by the org it is for.

## The quick-add box starts with no org

ADR-0012 started the box's picker at the personal org, because a task filed
there by accident is private. Nothing stands in for that org now. An org that
holds one member today is not private tomorrow, so a slip filed there could
appear on a new member's board.

So the picker starts with no org picked each time a person opens Tusker, and the
box refuses an add until one is picked. The pick then holds for the visit, as
ADR-0012 says, and undo returns it to no org picked. The chip names the picked
org whenever a person belongs to more than one. A person who belongs to one org
has no picker, and that org is implied.

The cost is the one ADR-0012 already paid for a team org: one pick per visit.

## The current org falls back to the first joined

A person whose cookie names no org has, as their current org, the org they
joined first. The switcher and the account page list orgs in the order the
person joined them, so that org is also first in the list.

## Considered and rejected

**Start the picker at the current org.** It is the "remember the last org"
answer that ADR-0012 rejects, one step removed.

**Keep a personal kind that a person can choose at `/orgs/new`.** It keeps every
check this decision removes, to serve a person who can already make an org of
one.
