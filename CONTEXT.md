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

**Account**:
One person's way in: an email, and a password or a mailed link. An account is
not an org and not a client, so the word keeps that one meaning.
_Avoid_: Login, profile, user record

**Invitation**:
How every account after the first is made. Tusker has no public signup, so a
member invites the person from the org's members page, or a script posts to the
invite endpoint with the token. Either way Tusker makes the account. An
invitation from the members page also mails the person a link that signs them
in.
_Avoid_: Signup, registration

**Bootstrap**:
The page that makes the first account, at `/bootstrap`. It is open while the
instance holds no account, and it is a 404 after that.
_Avoid_: Setup wizard, first-run signup

**Scope**:
Proof that the signed-in person is a member of one org. Every query that reads
or writes task rows takes a scope, not a bare org id, and one function makes
one. Scoping by hand is how a row leaks.
_Avoid_: Tenant context, org guard

**Read scope**:
Proof that a request may read one org's task rows. A scope is one. An org key
is the other, and it names an org and no person. Every read an org key can
reach takes a read scope, and every write still takes a scope.
_Avoid_: Anonymous scope, key context

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

**Decision mark**:
The flag that says a task holds a decision, in `tasks.decides`. It is off by
default, and only a marked task raises the decision prompt. A person sets it in
the board's quick-add box when the task is made, and on the task page after.
See ADR-0010.
_Avoid_: Decision flag, needs-decision

**Decision prompt**:
The box that asks for a title and a rationale when a marked task moves to Done.
Nothing records the ask: a skip is a not-now, and the prompt comes back the next
time the task is finished. A task that already holds a decision is never asked
again. See ADR-0010.
_Avoid_: Decision dialog, done modal

**Decision log**:
One org's decisions, newest first, at `/o/:slug/decisions`. A line with no task
is a record still standing after the work is gone.
_Avoid_: Decision history, changelog

**Archive**:
A flag on a task, not a status. An archived task keeps its Done or Cancelled
status.
_Avoid_: Closed, hidden

### Order

**Order**:
The sequence of tasks in a column. A column has one order, the org's, and any
member can change it. Tusker has no priority levels. The sequence is the
priority. One person's own order is the plan, not a second order of the board.
See ADR-0006.
_Avoid_: Priority

**Position**:
The org's shared number for a task, a fraction so that a drop between two cards
takes the midpoint. Any member can change it.

**Rank**:
The number a card shows in its column, counting from one. It is the place the
order puts the card, read at draw time, and no row stores it.
_Avoid_: Personal priority, personal rank

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
event. It names the refs path and nothing else: the address and the key belong
to the org. The task stores the external id. The board shows the label.

**Ref option**:
One cached `{id, label}` pair for a reference field. Tusker pulls the list from
the org app and reads the cache when a person opens a picker.

**Refs endpoint**:
The read-only endpoint an org app exposes for one list. It sits at the org's
refs base URL plus the field's refs path, and it returns `{id, label}` rows and
nothing else.

**Refs base URL**:
The address of an org's org app, as far as the part every refs endpoint of it
shares. The org holds it, a reference field adds its refs path, and the joined
URL must keep the base's origin before the refs key is sent.
_Avoid_: Source URL, endpoint root

**Option colour**:
A colour one value of a reference field carries, so a card tells one client from
another at a glance. It belongs to the value, not to the field, and Tusker holds
it rather than the org app. A value with no option colour draws plain. See
ADR-0006.
_Avoid_: Field colour, tag colour, client dot

**Palette**:
The closed set of named colours an option colour can name. A colour is a palette
name or an exact colour, and nothing else.
_Avoid_: Theme, swatch set

**Refs key**:
The key Tusker sends to an org app to read a refs endpoint. The org app mints
it, stores it hashed and can revoke it. Tusker holds the plaintext on the org,
because the key opens the org app and not one list of it. One org names one org
app. See ADR-0005.
_Avoid_: Source key, endpoint secret, field key

**Org key**:
The key an org app sends to Tusker to read tasks. Tusker mints it, stores it
hashed and can revoke it. It identifies the org, not a person. See ADR-0005.
_Avoid_: API key, org API key

**Task API**:
The read-only endpoint Tusker exposes for an org app, at `/api/tasks`. It takes
an org key, answers that org's live tasks and narrows by status and by a custom
field value. It is the mirror of the refs endpoint: this one Tusker serves and
the org app reads. See `docs/task-api.md`.
_Avoid_: Tasks endpoint, public API

### Views

**Board**:
The To do, In progress and Done columns for one org, with Backlog and Cancelled
shown by rule.

**Plan**:
The tasks one person chose for one day, in the order they mean to work them. A
plan belongs to the person and can hold tasks from several orgs.

**Plan mode**:
The page where a person builds a plan: pick the tasks, order them, keep them. It
is the unified view with selection turned on, at `/me/plan`, and `/me/plan/:day`
for a named day. Every pick and every step writes the plan row, so nothing waits
on a tab and there is no Commit button. See ADR-0008.
_Avoid_: Daily planner, plan builder

**Leftovers**:
The tasks the last plan holds that are still unfinished. Opening plan mode on a
day with no plan offers them: carry them forward, or start clean. A plan is
never rewritten after its day, so carrying forward copies them and leaves the
old row as it was.
_Avoid_: Rollover, unfinished carry-over

**Today chip**:
The control on a board that narrows it to the tasks today's plan holds. A board
with no plan for today carries no chip.
_Avoid_: Today filter, my-day toggle

**Focus**:
A mode that shows one batch of tasks and hides the rest until that batch is
done, at `/me/focus`. It draws from the plan when a plan exists, and from the
unified view when none does. See ADR-0009.
_Avoid_: Focus timer, deep work mode

**Batch**:
The tasks focus mode shows at one time, three at the most. The plan is cut into
threes from the top, and the batch is the first three that hold an unfinished
task. No row stores a batch.
_Avoid_: Chunk, sprint, session

**Drop**:
Taking a task out of a batch without finishing it. The task moves to the end of
today's plan, so it comes back last. See ADR-0009.
_Avoid_: Skip, snooze, defer

**Unified view**:
One person's tasks across every org they belong to, in percentile order.
_Avoid_: My tasks page, global board
