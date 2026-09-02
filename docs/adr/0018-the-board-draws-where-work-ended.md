# The board draws where work ended

The unified board at `/me` draws Done on every load, between In progress and
Cancelled. There is no Done switch. Backlog and Cancelled stay switches, on both
boards.

## The rule

A board draws work in hand and where it ended.

To do and In progress are work in hand. Done is where work ended. Neither is
something a person should have to ask for: a board that hides the last seven
days of finished work answers "what am I doing" and refuses "what did I do".

Backlog is neither. It is the pile a person has not started. So it comes by rule
on the org board, where the column appears on its own when To do and In progress
are both empty, and by request everywhere else.

Cancelled is where work ended too, but it is off the run. A card reaches it by a
drag or by the select, and never by a step. See
[ADR-0015](./0015-a-drop-names-a-column-not-a-place.md). It is the outcome a
person looks up, not the one they work from, so it stays a request.

## Why not a switch

A switch says "this is one view of several". Done is not a view. The person who
opens `/me` on Friday wants the week they had, and a switch makes them ask for
it every time, on every device, because the address does not follow them.

The column is drawn even when it holds nothing. A person who finished no work in
the last seven days sees an empty Done column. A column that comes and goes
teaches nothing: it is there on a good week and missing on a bad one, and the
person cannot tell the empty column from the hidden one.

## The cap stays

Done and Cancelled still cap to the last seven days of finish time on this
board. The cap is about column length, not about visibility: across every org an
uncapped Done is every task the person ever finished, and no column can carry
that.

The org board has no cap. It reads one org, and one org's Done is a length a
person can scroll.

## Consequences

Both boards now offer the same two switches, Backlog and Cancelled, out of one
list: `BOARD_TOGGLES`. Before this there were two lists that had to stay equal,
and they did not.

An address that still carries `?done=1` — a bookmark, or a narrowing a browser
remembers — does nothing. There is no redirect and no cleanup: the parameter
names no switch, so the board reads it as it reads any word it does not know.

The org board is unchanged.
