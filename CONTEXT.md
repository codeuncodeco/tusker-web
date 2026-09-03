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

**Org colour**:
The colour one org carries, drawn wherever a page names that org beside
another: the unified board, plan mode and the week page. It is a palette name
or an exact colour, as an option colour is. A new org takes the first palette
name no org of its maker holds, and any member changes it on the org's settings
page. An org with no colour draws grey. See ADR-0020.
_Avoid_: Org theme, org tag, workspace colour

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
because `/` sends that person to the unified board. While the instance holds
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

**Description box**:
The control that edits a description: a read view with an Edit button, and an
uncontrolled textarea that opens in its place and takes focus. Leaving the box
saves the whole text: Done, or Escape, or a click away. Tab indents, so Tab is
not the way out. The textarea is uncontrolled because the keys write the
text and move the caret in place, and a re-render mid-edit loses the caret.
_Avoid_: Description editor, description form

**List keys**:
The keys a keyed list binds, in `app/unified-keys.ts`: `j` and `k` move the
cursor, `Escape` empties it, `Enter` opens, `p` plans, `x` finishes, `>` and
`<` walk a task between columns, and `J` and `K` step a planned task through
the plan. One table,
`app/key-map.ts`, holds the key of every act, and one hook binds the list's
own, so the board, the plan, the week and focus mode cannot drift apart. `n`
takes three more, and the offer that ends a batch binds it where it is drawn. A page says which
acts it gives; the rest answer nothing. The peer of **Editor keys**: one is for
a list and one is for a box, and `isPagePress` is the border between them.
_Avoid_: Hotkeys, shortcuts, bindings

**Key hint**:
The mark a control carries to name its key: `Plan p`, `Finish x`. It is drawn
where the pointer is fine, because a phone has no keyboard, and it rides beside
`aria-keyshortcuts` on the control. The eye reads `⇧K` and the machine reads
`Shift+K`: the two forms differ because the attribute has its own grammar. A
sentence under a list that teaches the same key is a repeat, and goes.
_Avoid_: Shortcut badge, keycap, tooltip

**Editor keys**:
What a description textarea does with a press, in `app/editor.ts`. Enter inside
a list item continues the list at the same indent and keeps the checkbox
marker, and Enter on an empty item ends the list. Tab and Shift+Tab indent and
outdent the selected lines by two spaces. Cmd or Ctrl and K makes a link out of
the selection. Pasting a URL over a selection wraps the selection as a link.
The keys are the whole interface: there is no toolbar, and there is no bold or
italic.
_Avoid_: Shortcuts, markdown toolbar, rich text

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
status, and it leaves the org board, the unified board and every plan. Restoring
it puts it back in the column it held. `tasks.archived_at` holds when it was
archived, and the archive screen sorts by it.
_Avoid_: Closed, hidden

**Sweep**:
Archiving a whole column in one act. Both boards carry it: the Done and
Cancelled columns hold the button in their head, beside the name and the count,
while the column holds a card. It archives exactly what is on screen: whatever
narrowed the column is the whole rule. A person archives the set they are
looking at, and that is what makes the sweep safe. Narrowing decides the set and
never the button, and no key binds it. A sweep of the unified board spans orgs:
each card names the org that holds it, and the write runs once per org, in
sequence. A run that stops part way reports the ids it changed, and the undo
restores those. The batch reports itself in a **Toast**, which holds the one
undo. See ADR-0019.
_Avoid_: Bulk archive, clear column

**Toast**:
One short message about an act that is already done, with at most one way to
take it back. It is drawn over every page, one at a time, and it goes by itself
after a short while or when a person sends it away. A batch is what needs one:
a sweep takes several cards away at once, and the count is the only proof of
what happened. The region is live, so a reader announces the message. The undo
is a form button, so a keyboard reaches it. A message also carries a link per
org the act touched, because there is no cross-org **Archive screen**, and an
undo that stopped part way says so and asks for a second press.
_Avoid_: Snackbar, notification, flash message

**Archive screen**:
One org's archived tasks as a flat list, newest archived first, at
`/o/:slug/archive`. It is per org: there is no cross-org archive, so a **Sweep**
of the unified board files into several, and its **Toast** links to each one. It
carries the org board's Today chip, and it holds Cancelled tasks whatever that
board's Cancelled toggle says. Archived work is a history a person scans, not a
pipeline they rearrange, so it has no columns and no drag.
_Avoid_: Archive board, history page

**Run**:
The columns a card steps along, in workflow order: Backlog, To do, In progress,
Done. The `>` and `<` keys walk it and stop at both ends. Cancelled is off the
run, because an outcome is not the next step, so a card reaches Cancelled by a
drag or by the select. See ADR-0015.
_Avoid_: Workflow, pipeline, stage list

**Finish**:
Ending a task, which is always a move to Done. The form names no column,
because finishing has only one to name. Cancelling is not finishing, though a
cancelled task carries a finish time.
_Avoid_: Complete, close

**Finish time**:
When the work was over: `tasks.finished_at`. A move into Done or Cancelled
writes it, a move out clears it, and every other write leaves it alone. The
unified board's seven-day cap reads it, because `updated_at` moves on every
edit and a typo fix would otherwise read as a finish.
_Avoid_: Completed at, closed date

### Order

**Order**:
The sequence of tasks in a column. A column has one order, the org's, and any
member can change it. Tusker has no priority levels. The sequence is the
priority. One person's own order is the plan, not a second order of the org
board. See ADR-0006.
_Avoid_: Priority

**Position**:
The org's shared number for a task, a fraction so that a drop between two cards
takes the midpoint. Any member can change it.

**Rank**:
The number a card shows in its column, counting from one. It is the place the
order puts the card, read at draw time, and no row stores it.
_Avoid_: Personal priority, personal rank

**Percentile order**:
The rule that sorts a cross-org column. A task takes its fractional place inside
its own org column, and the due date breaks a tie. It is what makes the unified
rank drift between loads: the place is an index over a column length that
changes.

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
name or an exact colour, and nothing else. A name carries no hex: each one has a
`--color-opt-<name>` design token that holds its light value and its dark one.
A name the palette no longer holds draws grey, because a colour outlives the
palette that named it.
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

**Origin**:
The page a task was opened from, carried into the task URL as `from`. Every
link into a task writes it: the board, the unified board, plan mode, focus
mode, the week page, the decision log and the archive. The task page draws a
back link to it and binds `Esc` to the same place, and both replace the page
rather than stack it. A finish that raises the decision prompt keeps the
origin. An origin holds the query of the page it names, so a board narrowed to
today comes back narrowed, and it drops the decision prompt, which is a raised
prompt and not a view. It is a path inside the app, so an origin that names
another site is dropped, and a task opened from nowhere goes back to the org's
board. It rides in the URL and not in a cookie, so a reload keeps it and two
tabs cannot fight over it.
_Avoid_: Referrer, back stack, return URL, here

**Board**:
A page that draws tasks as one column per status. Tusker has two, the **Org
board** and the **Unified board**. They are one page over two sets of rows: the
same five columns, the same cards, and the same keys except the two that step a
stored order. The bare word is right where one board is in view, or where the
rule holds for both. Where the two stand together, name them.
_Avoid_: Kanban, board view

**Org board**:
The To do, In progress and Done columns for one org, at `/o/:slug/board`, with
Backlog and Cancelled shown by rule. The order inside a column is the org's and
it is stored, so this is the one board where a card is dragged into a place, and
the one that binds `J` and `K`. See ADR-0016.
_Avoid_: Team board, project board, the org's board

**Unified board**:
The same five columns across every org one person belongs to, at `/me`. A person
who learns the org board meets the same page across all of them. Done is drawn
on every load, empty or not. The board draws work in hand and where it ended,
and where work ended is never a request. See ADR-0018. Backlog and Cancelled are
switches here, the same two the org board offers. Backlog takes no rule here,
because the org board's rule reads "this person holds no live task anywhere" and
is therefore dead. Done and Cancelled cap to the last seven days of finish time.
Inside a column the order is percentile order, and it is derived: no card is
dragged into a place and no card steps. A card still moves between columns,
because a column is a status: by drag, by key or by the card's select. See
ADR-0015.
_Avoid_: Unified view, my tasks page, global board

**Quick-add box**:
The box that makes a task from a typed title. On a board it sits at the top of a
column, and the column names the status. On the unified board and in plan mode
it carries an org picker, which starts at the personal org every time a
person opens Tusker. A team org draws a chip that names it while the box holds
it. The decision mark is set here. The box also names the assignees, out of the
members of the org it files into: the set starts empty, it stays across an add,
and a change of org empties it. A personal org holds one member, so no box
filing there draws the picker. The title is a textarea one line high: Enter
posts and Shift+Enter makes a line, so a pasted list keeps its line breaks.
See ADR-0012 and ADR-0013.
_Avoid_: Composer, capture box, new task form

**Pasted list**:
Several lines posted from one quick-add box. Each non-empty line, trimmed, is
one task, in the order the lines appear, and the block lands at the top of the
column with the first line topmost. The mark and the picked members go on all
of them or on none, because one box holds one tick and one set. A list of more
than 100 lines is refused and writes nothing. One box raises one decision
prompt, so a marked list typed straight into Done is asked about the task on
top of it.
_Avoid_: Bulk add, batch, import

**Undo an add**:
The line the quick-add box shows after it makes a task. It counts what the add
made, deletes every row that add wrote, drops them all from the day's plan, and
gives the box back the whole text as it was typed and the mark, with the picker
reset to the personal org and the assignee set emptied with it, so a task typed
into the wrong org is filed again rather than typed again. One add is one act,
so its undo is one act. It is the only delete Tusker has. See ADR-0012.
_Avoid_: Trash, revert

**Week set**:
The tasks one person means to finish in one named week, in the order they mean
to take them. It holds no day: the week set says what and how it ranks, and the
plan says when. A pick lands on top, a task written back from a day lands at the
foot, and a member finished this week sinks under the live ones and keeps its
rank. It belongs to the person and can hold tasks from several orgs. Membership
is always per named week, so a task is in the set of week 36 and not "in the
week set". See ADR-0014 and ADR-0021.
_Avoid_: Week plan, weekly backlog, commitment

**Week page**:
The page where a person builds a week set and puts it in order, at `/me/week`,
and `/me/week/:week` for a named week. It draws the live set as a list, as plan
mode does, with the quick-add box, and the week it names runs Monday to Friday.
`J` and `K` step a member, `T` promotes one to the top, and the set is the one
order on the page. Every pick and every step writes, as in plan mode. All of
that is the week the person is in, and the weeks ahead of it: a week that is
over is read, not rewritten, so the **week walk** to it draws its set alone and
offers the **take**. See ADR-0014 and ADR-0021.
_Avoid_: Weekly planner, week board

**Plan**:
The tasks one person chose for one day, in the order they mean to work them. A
plan belongs to the person and can hold tasks from several orgs. Every task a
plan holds is in that week's set: picking a task the set does not hold adds it.
See ADR-0014.

**Plan mode**:
The page where a person builds a plan: pick the tasks, order them, keep them.
It draws the live set as a list, at `/me/plan`, and `/me/plan/:day` for a named
day. Plan mode, focus and the unified board share the live set and the sort,
and lay them out differently: a plan drawn from a Done column is nonsense. The
week set comes first, in week order, and the rest of the live set under a
heading below it. Plan mode reads that order and never writes it: the one order
it owns is the plan's. Every pick and every step writes the plan row, so
nothing waits on a tab and there is no Commit button. All of that is the day the person is in, and the days
ahead of it. Reading a finished day back is not plan mode's act, so a **Day
walk** to a day behind today draws the plan alone. See ADR-0008 and ADR-0014.
_Avoid_: Daily planner, plan builder

**Week walk**:
The controls that carry the week page from one week to the next: the week
before, the week after, the key itself as a link to its own address, and the
way back to this week. It is what makes `/me/week/:week` reachable. A week that
is over is read and not rewritten, so it draws no pick, no step and no box, and
offers the **take** instead. This week and the weeks after it plan as they
always did, and a week nobody started draws empty and offers what it always
offers.
_Avoid_: Week picker, week navigator

**Day walk**:
The controls that carry plan mode from one day to the next: the day before, the
day after, and the way back to today. The **day name** heads the page and links
to the day's own address, so the walk and that link together are what make
`/me/plan/:day` reachable. Building a plan and reading one back are not the same
act, so a day before today draws its plan alone: no shelf, no pick, no step, and
no add. Today and the days after it plan as they always did.
_Avoid_: Date picker, day navigator

**Day name**:
The day as a person reads it: "Thursday 3 September". The weekday is the part a
person counts by, so it comes first, and the year is written only outside the
year the reader is in. A heading puts "Today", "Yesterday" or "Tomorrow" in
front of the name where the day is one step from today. The name is read in
UTC, so it is the day itself and not the reader's evening. The address and the
stored day keep `YYYY-MM-DD`: only the reading changes.
_Avoid_: Date string, formatted date

**Leftovers**:
The unfinished members of a week that is over. Two doorways reach them, the
**carry** and the **take**, and both copy the memberships and leave the old
ones as they were, so a task is in both sets: a week set is never rewritten
after its week. A day carries nothing: each plan starts empty, and the week set
is where unfinished work waits. See ADR-0014.
_Avoid_: Rollover, unfinished carry-over

**Carry**:
The doorway an unstarted week opens on: take the leftovers of the last week
that holds a set, or start clean. It is offered once, when the week opens, and
the week it names is not always the week before. Either answer starts the week,
so the offer is not made again. See ADR-0014.
_Avoid_: Rollover prompt

**Take**:
The doorway a week that is over holds, and the one write it answers: its
leftovers, fetched into the week the browser is in. A person asks for it, from
that week's own page, as often as they like, and the button names the week the
block lands in. The block lands on top of the target set and keeps its own
order, because it is work a person went and fetched. Taking into a week with no
set starts that week, as a carry does. See ADR-0014 and ADR-0021.
_Avoid_: Pull forward, re-carry

**Today chip**:
The control on a board that narrows it to the tasks today's plan holds. Both
boards carry one. A person with no plan for today gets no chip on the unified
board, and the org board's chip then leads to plan mode instead.
_Avoid_: Today filter, my-day toggle

**Week chip**:
The control on a board that narrows it to the tasks this week's set holds. It
sits beside the Today chip and reads the same way: both boards carry one, a
person with no set for this week gets no chip on the unified board, and the org
board's chip then leads to the week page. The two narrowings are exclusive, so
a board is narrowed by one, or by neither.
_Avoid_: Week filter, this-week toggle

**Column switch**:
The control on a board that draws a column the board hides by default. It names
the column and holds no verb: the box says whether the column is drawn. Backlog
and Cancelled, on both boards. Done takes no switch: the board draws where work
ended. See ADR-0018.
_Avoid_: Show link, column filter, toggle

**Focus**:
A mode that shows one batch of tasks and hides the rest until that batch is
done, at `/me/focus`. It draws from the plan when a plan exists, from the week
set when none does, and from the live set when there is no set either.
See ADR-0009 and ADR-0014.
_Avoid_: Focus timer, deep work mode

**Batch**:
The tasks focus mode shows at one time, three at the most. The plan is cut into
threes from the top, and the batch is the first three that hold an unfinished
task. No row stores a batch.
_Avoid_: Chunk, sprint, session

**Header**:
The one bar every signed-in page draws, in two rows. Row 1 names who and
where: the wordmark, the current org and the account. Row 2 is every page as a
button, in a person half for Tasks, Week, Plan and Focus and an org half for
the current org's pages. Both halves are always drawn, and the page a person
stands on is marked. `/account` stands in neither half, so it marks neither. A control
that comes and goes teaches nothing, so nothing in the header is drawn by rule.
See ADR-0011.
_Avoid_: Chrome, nav bar, top bar

**Assignee filter**:
The select on the org board that narrows it to the tasks one member holds:
`Anyone`, `Unassigned`, then each member in name order. `Anyone` is the start
and narrows nothing. A member answers for a task they hold among others, and
`Unassigned` answers for a task nobody holds. It lives in the address, it joins
the remembered narrowing, and it narrows what the Today chip and the search
already left. A personal org carries no filter, because it draws no assignee.
The unified board carries none either: a member select there would name
strangers. See ADR-0013 and ADR-0017.
_Avoid_: My tasks toggle, owner filter

**Search**:
The box on the org board that narrows it to the tasks holding the text in
their title or description. It is one more narrowing beside the filters, not a
screen of its own: the same board, the same columns, the same drag. The match
runs in SQL, as a `LIKE` over each of the two columns, so a match is a match
in one of them and never across the seam between them. It is case-insensitive
for ASCII, which is what `LIKE` gives. A `%` or a `_` typed in the box is a
character to find, not a wildcard. Nothing is ranked: the column order stands.
_Avoid_: Full-text search, query, find

**Remembered narrowing**:
The search and the assignee filter an org board was left with. It belongs to
the person, so the browser holds it, one entry per org. A board opened with no
query at all gets it back in the address. A board opened with a query keeps
that query as it stands, so a search cleared by hand stays cleared.
_Avoid_: Saved filter, sticky filter, last view

**Live set**:
To do and In progress, across every org one person belongs to, in percentile
order. The unified board draws it as two of its five columns, and plan mode and
focus draw it as a list. It is not narrowed to the tasks the person holds: the
plan is where a person's own list lives, and the assignee filter narrows the org
board.
_Avoid_: My tasks, unified view

**Card keys**:
What a press does to the card the cursor names, on the org board, the unified
board, plan mode and the week page. `j` and `k` move the cursor, `Escape`
empties it, `Enter` opens the task, `x` finishes it, `n` goes to the quick-add
box, and `>` and `<` walk the card along the run. `p` plans or unplans, on the
pages that draw a plan control. `J` and `K` step a stored order, and `T`
promotes a card to the top of one: the org's order on the org board, the day's
in plan mode, and the week's on the week page. A move names the card and the
way, never a place, because the page's copy of the order is one load old. Focus
mode narrows the map to `j`, `k`, `Escape`, `Enter`, `x`, `n` and `d`, which
drops a task from the batch. Every key posts what a control on the page posts,
so no act is reachable by key alone. See ADR-0016.
_Avoid_: Shortcuts, hotkeys, bindings

**Cursor**:
The card the keys act on, or no card at all. It names a card and not a place,
so the card keeps the cursor while the page redraws around it. It starts empty,
`Escape` empties it again, and `j` and `k` fill it: `j` takes the first card,
`k` the last. A click on a card body places it. A card the page stops drawing
takes the cursor with it, and every key that needs a card does nothing while
the cursor is empty. Focus mode draws three rows and gives no click.
See ADR-0015.
_Avoid_: Selection, focus, highlight

### Look

**Design token**:
One named colour or face that every screen draws through, declared in
`@theme` in `app/app.css`. A colour token is a `light-dark()` pair, and
`<html>` carries `color-scheme: light dark`, so the token flips itself. This
is why no component carries a `dark:` variant, and why a raw Tailwind colour
class in a component is a drift to fix and not a choice.
_Avoid_: Theme variable, CSS custom property, design system

**Ground**:
What a token names when it names a background: `bg` for the page, `surface`
for what sits on the page, and `surface-2` for what sits on that. A card is
one step up from the page, and a chip on a card is one step up again.
_Avoid_: Background colour, level, elevation

**Accent**:
`#ffc93f`, the one warm colour of the family. It has two jobs and no others:
the `:focus-visible` outline, and the `::selection` background. Where else it
earns its place is an open design question.
_Avoid_: Brand colour, primary, highlight
