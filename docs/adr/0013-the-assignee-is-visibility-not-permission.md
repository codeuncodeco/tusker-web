# The assignee is visibility, not permission

Amended by [ADR-0017](./0017-the-assignee-filter-names-a-member.md). The
argument below stands; two parts of the answer changed. The filter is a select
of the org's members, not the three fixed choices this ADR draws, and it lands
on the org board alone.

A task can name the members who hold it. The name is the **assignee**, a task
can carry several, and the whole feature is a label plus a filter. It changes
nothing about who may read a row.

ADR-0006 makes this decision harder than it looks. That ADR deleted
`task_ranks`, a second per-person layer over the org's board, because two
orders need two paths and two labels on every surface that orders anything. It
named the plan as the answer to "what is personal". An assignee is a second
per-person layer on the same board, so it has to answer the same challenge:
why does the plan not already do this job?

Because the plan answers *when*, and only for the person who made it. A plan is
private, it covers one day, and it holds the tasks a person already knows about.
None of that hands work to somebody else. Today the only way to give a member a
task is to say so in another app, and the board keeps no record that it
happened. The assignee is that record.

## The number is a trade

One assignee per task is the safer shape. A set of holders is the standard way
accountability leaks: a task held by four people is a task held by nobody, and
the pair "hand this over" and "hand this to a crowd" do not sit well together.

A task takes several anyway. Work in these orgs is done in pairs more often than
the clean model admits, and the honest alternative — split the task — makes two
rows that must then be kept in step by hand. The cost is real and stays on the
record: a crowded task is one nobody has taken.

## A table, not a column

`0004_create_tasks.sql` shipped an unused `assignees TEXT DEFAULT '[]'`. The set
goes to a `task_assignees` table instead, keyed by task and account, carrying
`org_id` so the foreign key reaches `memberships (org_id, user_id)`. The old
column is dropped in the same migration.

A JSON list cannot say the one thing that matters here: an assignee is a member
of the org that holds the task. The table says it, and the database keeps it
true. Losing the membership therefore loses the assignments, which is the right
end: an assignee who is not a member contradicts "membership is the only
permission check", and the members page warns how many live tasks are about to
lose a holder before it removes anybody.

## A filter, and no mail

The board and the unified view each grow one control: mine, unassigned, or
everyone. It is everyone by default, and it lives in the address, so a narrowed
list is a link and the Today chip's pattern is reused rather than doubled.

ADR-0017 amends the shape and the reach: the control is a select of the org's
members, `Anyone` first, and the org board carries it alone.

**Unassigned** is a state of the filter, not a hidden case. A filter that only
offers "mine" makes every untaken task invisible to each person who turns it on,
and untaken work is the work that most needs a reader.

Nothing is mailed. The wish behind the feature is routing — hand a task over and
have the person find it — and a filter does not reach anybody who is not already
in Tusker. What ships is therefore commitment plus a filter, and that is the
claim to make for it. Mail is a small addition later, and a hard one to take
back once people wait for it, so it waits for the first person who is actually
missed.

## Two silences

A personal org has one member, so it draws no assignee and no filter. A field
whose only value is "me" is noise on every card of the org a person reads most. The rule reads the kind of the org, not its member count: see ADR-0017.

`/api/tasks` does not answer with assignees. ADR-0005 gives the org key an org
and no person; answering it with the members of that org turns a task-read key
into a directory read. An org app that needs to know who is on a task is a
separate decision, with its own argument.

## Consequences

Membership stays the only permission check. Every member of an org reads every
task of it, assigned or not, and the assignee narrows a view rather than a
scope.

That holds while an org is a handful of colleagues. It does not hold when crew
hold Tusker accounts, because a crew of forty reading each other's rows is a
different product. The question — is assignment a permission check then, or a
third scope beside scope and read scope? — is parked, not answered.

The word **owner** is not used for this. `memberships.role` already has
`'owner'`, and one word for "runs the org" and "does this task" is the
overloading the glossary exists to stop.
