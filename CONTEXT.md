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

**Current org**:
The org a person visited last, and the one the header names while they stand on
a person page. A session cookie holds it, and every visit to an org page
rewrites it. A person who has visited none yet has their personal org.
See ADR-0011.
_Avoid_: Active org, selected org, org context

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

**Landing**:
The page at `/` for a person with no session: the product line, the note that
Tusker is invitation only, and the way in. A signed-in person never sees it,
because `/` sends that person to the unified view. While the instance holds
no account, `/` sends the person to Bootstrap.
_Avoid_: Home page, marketing page, splash

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

**Description**:
The raw markdown a task carries, in `tasks.description`. The column holds text,
and the page renders it. Tusker draws a small subset: code spans, links, bare
URLs, emails, checkbox lines and fenced blocks. Bold and italic were dropped on
purpose.
_Avoid_: Body, notes, details

**Checkbox line**:
A `- [ ]` or `- [x]` line of a description, drawn as a live box. Ticking one
flips that line in the raw text and saves the whole description. A
checkbox-looking line inside a fenced block is text, and no box counts it, so
the Nth box on screen is always the Nth toggleable line.
_Avoid_: Subtask, task list item, todo

**Assignee**:
A member who holds a task. A task can have several, and a task with none is
unassigned. An assignee says who does the work and nothing about who may read
it: membership is still the only permission check. Removing a member from an org
takes their assignments with them. See ADR-0013.
_Avoid_: Owner, task owner, responsible

**Unassigned**:
A task no member holds. It is a state to look at, not a gap to hide: the
assignee filter names it, so the queue of work nobody has taken is one control
away.
_Avoid_: Unowned, orphan, inbox

**Decision**:
A record of what was decided, kept by the org. A decision outlives the task that
produced it, so a deleted task leaves the decision in place.

**Decision mark**:
The flag that says a task holds a decision, in `tasks.decides`. It is off by
default, and only a marked task raises the decision prompt. A person sets it in
the quick-add box when the task is made, and on the task page after.
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

**Refs path**:
The list one reference field reads, under its org's refs base URL, as `trails`.
It carries no scheme, no `//` prefix and no `..`, so it cannot move the host the
refs key is sent to.
_Avoid_: Source URL, endpoint path, field URL

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

**Quick-add box**:
The box that makes a task from a typed title. On a board it sits at the top of a
column, and the column names the status. On the unified view and in plan mode it
carries an org picker instead, which starts at the personal org every time a
person opens Tusker. A team org draws a chip that names it while the box holds
it. The decision mark is set here. The title is a textarea one line high: Enter
posts and Shift+Enter makes a line, so a pasted list keeps its line breaks.
See ADR-0012.
_Avoid_: Composer, capture box, new task form

**Pasted list**:
Several lines posted from one quick-add box. Each non-empty line, trimmed, is
one task, in the order the lines appear, and the block lands at the top of the
column with the first line topmost. The mark goes on all of them or on none,
because one box holds one tick. A list of more than 100 lines is refused and
writes nothing. One box raises one decision prompt, so a marked list typed
straight into Done is asked about the task on top of it.
_Avoid_: Bulk add, batch, import

**Undo an add**:
The line the quick-add box shows after it makes a task. It counts what the add
made, deletes every row that add wrote, drops them all from the day's plan, and
gives the box back the whole text as it was typed and the mark, with the picker
reset to the personal org, so a task typed into the wrong org is filed again
rather than typed again. One add is one act, so its undo is one act. It is the
only delete Tusker has. See ADR-0012.
_Avoid_: Trash, revert

**Week set**:
The tasks one person means to finish in one named week. It is membership and
nothing else: no order, no day. The week set says what, and the plan says when.
It belongs to the person and can hold tasks from several orgs. Membership is
always per named week, so a task is in the set of week 36 and not "in the week
set". See ADR-0014.
_Avoid_: Week plan, weekly backlog, commitment

**Week page**:
The page where a person builds a week set, at `/me/week`, and `/me/week/:week`
for a named week. It is the unified view with selection turned on, with the
quick-add box, and the week it draws runs Monday to Friday. Every pick writes,
as in plan mode. See ADR-0014.
_Avoid_: Weekly planner, week board

**Plan**:
The tasks one person chose for one day, in the order they mean to work them. A
plan belongs to the person and can hold tasks from several orgs. Every task a
plan holds is in that week's set: picking a task the set does not hold adds it.
See ADR-0014.

**Plan mode**:
The page where a person builds a plan: pick the tasks, order them, keep them. It
is the unified view with selection turned on, at `/me/plan`, and `/me/plan/:day`
for a named day. Every pick and every step writes the plan row, so nothing waits
on a tab and there is no Commit button. It draws the week set first, and the
rest of the unified view under a heading below it. See ADR-0008.
_Avoid_: Daily planner, plan builder

**Leftovers**:
The tasks the last week set holds that are still unfinished. Opening the week
page on a week with no set offers them: carry them forward, or start clean. A
week set is never rewritten after its week, so carrying forward copies the
memberships and leaves the old ones as they were, and a carried task is in both
sets. A day carries nothing: each plan starts empty, and the week set is where
unfinished work waits. See ADR-0014.
_Avoid_: Rollover, unfinished carry-over

**Today chip**:
The control on a board that narrows it to the tasks today's plan holds. Every
board draws it, planned or not. A day with no plan holds nothing to narrow to,
so the chip is then a way to plan mode: a control that comes and goes teaches
nobody that plans exist. See ADR-0011.
_Avoid_: Today filter, my-day toggle

**Week chip**:
The control on a board that narrows it to the tasks this week's set holds. It
sits beside the Today chip and reads the same way: every board draws it, and a
week with an empty set makes it a way to the week page. The two narrowings are
exclusive, so a board is narrowed by one, or by neither.
_Avoid_: Week filter, this-week toggle

**Focus**:
A mode that shows one batch of tasks and hides the rest until that batch is
done, at `/me/focus`. It draws from the plan when a plan exists, from the week
set in percentile order when none does, and from the unified view when there is
no set either. See ADR-0009.
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

**Header**:
The one bar every signed-in page draws. It has a person half, for Tasks, Week,
Plan and Focus, and an org half, for the current org and its pages. Both halves are
always drawn, and the half a person stands in is marked. A control that comes
and goes teaches nothing, so nothing in the header is drawn by rule.
See ADR-0011.
_Avoid_: Chrome, nav bar, top bar

**Assignee filter**:
The control on a board and on the unified view that narrows by who holds a
task: mine, unassigned, or everyone. It is everyone by default, it lives in the
address, and on a board it narrows what the Today chip already left. An org of
one member carries no filter. See ADR-0013.
_Avoid_: My tasks toggle, owner filter

**Unified view**:
Every live task of every org one person belongs to, in percentile order. It is
not narrowed to the tasks they hold: the assignee filter does that, and the plan
is where a person's own list lives.
_Avoid_: My tasks page, global board
