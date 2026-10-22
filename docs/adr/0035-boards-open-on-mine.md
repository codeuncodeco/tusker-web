# Boards open on Mine

Built on the `ui-sandbox` branch. Amends [ADR-0013](./0013-the-assignee-is-visibility-not-permission.md),
[ADR-0017](./0017-the-assignee-filter-names-a-member.md) and
[ADR-0033](./0033-the-unified-board-filters-by-mine.md).

A person opens Tusker to do their own work. Both boards opened on `Anyone`, so
the first thing a person did on every visit was narrow the board to
themselves. Now both open there.

## A bare address is the reader's own work

- The unified board reads an address with no `assignee` as `Mine`.
- An org board that draws assignees reads it as the reader's own id.

The filter still lives in the address, and a link that names a filter still
opens on that filter. Only the absent value changed. An org of one draws no
filter and narrows nothing, as before.

## `Anyone` is said out loud

The absent value was `Anyone`, and an empty value said it too. Now the absent
value is the reader, so `Anyone` needs a word of its own: `assignee=anyone`. An
empty value still reads as `Anyone`, so an older link opens as it did.

The remembered narrowing keeps `anyone`. A person who widened a board to
everybody and comes back gets everybody, and nobody who never widened it does.
The org select carries `Anyone` as the word, for the same reason.

## Every filter is one click

The assignee filter and the field filters were selects: a click to open, a
click to pick. Each is now a row of chips, and each chip is a link that sets
one value of the address.

- The unified board draws `Mine`, `Anyone` and `Unassigned`.
- An org board draws the reader's own chip, `Anyone`, `Unassigned`, then every
  other member as an avatar.

A field with more than eight values still draws a select, because a row of
twelve chips is a wall. The address and the task API read the same names as
before.

## Consequences

- A quick add on an org board starts with the reader picked. That is the
  member the board is narrowed to, so `seededBy` already did it. A task a
  person adds is theirs, and it stays on the board they are looking at.
- ADR-0013's "everyone by default" no longer holds for the boards. Plan, week
  and focus are unchanged: they hold what the person put there.
