# The unified board filters by Mine

Ticket #239. Amends [ADR-0017](./0017-the-assignee-filter-names-a-member.md).

The unified board draws an assignee filter: `Anyone`, `Mine` and `Unassigned`.
It names no member. `Anyone` is the start and narrows nothing. `Mine` keeps a
task the reader holds, among others or alone. `Unassigned` keeps a task nobody
holds. It narrows in memory over the assignees the loader already reads, rides
the address under `assignee`, and joins the remembered narrowing, as the org
board's filter does.

ADR-0017 kept the filter off this board and named this pair as the shape that
could work there, "when somebody asks for it". Somebody asked.

## Why no member names

The reason in ADR-0017 still stands. The unified board spans every org one
person belongs to, so a member select there lists strangers beside colleagues,
with nothing to tell them apart. `Mine` and `Unassigned` name nobody, so neither
has that cost. The org board keeps its member list and gets no `Mine`: there,
the reader's own name already answers it.

## Why `me` in the address

`Mine` rides the address as `assignee=me`, not as the reader's id. A link is
read by whoever opens it, and a shared link to "my work" should show the
reader their own work. An id would show them somebody else's, on a board that
names no member and so cannot say whose. The board reads anything other than
`me` and `unassigned` as `Anyone`, a member id from an org board included. The
org board does not read `me`.

## Orgs of one

`Mine` reads the stored rows. Every unarchived task of an org of one is held by
its member (ADR-0032), so `Mine` finds the work a person does alone with no
special case, and `Unassigned` shows none of it. The loader therefore reads
assignees in an org of one as well. A card from such an org still draws no
initials.

## The org select carries the filter

A pick in the org select takes the filter to the next board, in that board's
words:

- All to one org: `Mine` becomes the reader's own id, and `Unassigned` stays.
- One org to All: the reader's own id becomes `Mine`, and `Unassigned` stays.
- Another member's id becomes `Anyone`, said in the address as an empty value,
  so the next board's memory does not stand in for a filter the person had on.
- An org of one draws no filter, so the value is dropped.
- A board under `Anyone` carries nothing, and the next board opens bare, with
  its memory, as it did before.

The rule needs the reader and the org's member count, which the header does
not hold, so a pick that carries a filter goes through `/go`, the route a pick
with no script already takes. A carried value is a query, so it wins over the
next board's remembered narrowing, as any address does.

## Remembered

The unified board remembers its filter as an org board does. Its browser key is
`tusker:board`. An org's key is `tusker:board:<slug>`, and a slug is never
empty, so no org can name the unified key.

## Consequences

The two boards still hold different selects, the cost ADR-0011 names. They now
share a word, `Unassigned`, and a question, *who holds this?*

On `Mine`, the unified quick-add box starts with the reader picked, in an org
that draws a picker, as the org board's box starts with the member it is
narrowed to. In an org of one, `createTasks` makes the reader the holder anyway.
