# An org of one stores its assignee, and shows nothing

Ticket #238. Amends [ADR-0013](./0013-the-assignee-is-visibility-not-permission.md)
and [ADR-0017](./0017-the-assignee-filter-names-a-member.md).

An org of one has no unassigned live task. Its one member holds every task that
is not archived and not deleted, and a row in `task_assignees` says so. No
screen shows it: an org of one still draws no picker, no initials and no
filter. "Live" means not archived and not deleted.

Three writes keep the rule true:

- `createTasks` writes the one member as the holder of every task it makes, so
  every way to make a task gets the rule with no extra work.
- `removeMember` hands every live task with no holder to the member who stays,
  when a removal leaves an org of one. The write is in the same batch as the
  delete, and it reads the count in the statement, so the rule is never false
  between two statements. A refused removal hands nothing on.
- Migration `0021_solo_assignees.sql` gives the tasks made before this their
  row.

A member who joins an org of one changes nothing. The org then draws a picker,
and the tasks made before show who held them.

## Stored, not derived

The other way was to store nothing, and let each reader treat a task in an org
of one as held by its one member. That needs no migration and no write. It was
rejected because every reader of assignees must then know the rule. The
unified board's `Mine` filter (#239) is the first such reader, and it would
hide every task of each org a person works in alone. A stored row gives every
reader the same answer with no special case.

A stored row also stays true after a second member joins. The old tasks then
show who did them, which a derived rule cannot do: the day the count is two,
the rule stops, and the tasks read as unassigned.

## The silence is keyed to the count

ADR-0013 ("Two silences") and ADR-0017 ("The silence stays keyed to the kind")
say the silence depends on the org's kind. ADR-0027 removed the kinds, and
`drawsAssignees` tests the member count. An org of one draws no assignee, and
an org of two or more draws one. That stays as it is. This ADR changes what is
stored, not what is shown.

## Consequences

`createTasks` takes an empty assignee list to mean unassigned, except in an org
of one, where it means held by the one member.

The members page still counts the live tasks a removed person holds as tasks
that lose a holder. When the org drops to one, those tasks go to the member who
stays instead. The count is not wrong, because the removed person no longer
holds them, but it does not say where they go.

`/api/tasks` still answers with no assignees (ADR-0013).
