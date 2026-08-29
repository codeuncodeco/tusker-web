# Tusker

A keyboard-first task board for several organizations at once. One person can be
a member of many organizations. Tusker holds every task row and gives that
person one list across all of them.

## Language

### Tenancy

**Org**:
A boundary that owns tasks and decides who can read them. A person belongs to
many orgs. Every org row carries an `org_id`.
_Avoid_: Workspace, team, tenant, account

**Personal org**:
The org that Tusker creates for a person at signup, with that person as the only
member. It is an org like any other. Only the label in the org switcher differs.
_Avoid_: Personal space, private tasks

**Member**:
A person with access to an org. Membership is the only permission check.
_Avoid_: Seat, collaborator

**Org app**:
A separate application that an org runs, such as blrhikes-app. An org app reads
tasks from the Tusker API and supplies the option lists for reference fields. It
does not own task rows.
_Avoid_: Linked client, remote app, integration

**Client**:
A customer of an org. This is a custom field an org declares, not a core table
and not a synonym for an org.
_Avoid_: Customer, account

### Work

**Task**:
One piece of work in one org. A task never belongs to two orgs.

**Decision**:
A record of what was decided, kept by the org. A decision outlives the task that
produced it, so a deleted task leaves the decision in place.

**Archive**:
A flag on a task, not a status. An archived task keeps its Done or Cancelled
status.
_Avoid_: Closed, hidden

### Order

**Order**:
The sequence of tasks in a column. Tusker has no priority levels. The sequence
is the priority.
_Avoid_: Priority

**Position**:
The org's shared number for a task, a fraction so that a drop between two cards
takes the midpoint. Any member can change it.

**Rank**:
One person's own number for one task, in the same fraction space as position. A
rank exists only for a task that person dragged. The order a person sees is
`COALESCE(rank, position)`.
_Avoid_: Personal priority

**Percentile order**:
The rule that sorts the cross-org list. A task takes its fractional place inside
its own org column, and the due date breaks a tie.

### Fields

**Custom field**:
A field an org declares for its tasks. Types are text, select, date and
reference. The value lives in the task's JSON column, not in a column of its
own.

**Reference field**:
A custom field that points at a record in an org app, such as a trail or an
event. The task stores the external id. The board shows the label.

**Ref option**:
One cached `{id, label}` pair for a reference field. Tusker pulls the list from
the org app and reads the cache when a person opens a picker.

**Refs endpoint**:
The read-only endpoint an org app exposes for one reference field. It returns
`{id, label}` rows and nothing else.

### Views

**Board**:
The To do, In progress and Done columns for one org, with Backlog and Cancelled
shown by rule.

**Plan**:
The tasks one person chose for one day, in the order they mean to work them. A
plan belongs to the person and can hold tasks from several orgs.

**Focus**:
A mode that shows one batch of three tasks and hides the rest until that batch
is done. It draws from the plan when a plan exists.

**Unified view**:
One person's tasks across every org they belong to, in percentile order.
_Avoid_: My tasks page, global board
