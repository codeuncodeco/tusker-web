# A task number names one task across orgs

A task was named by a UUID, and its page sat at `/o/<slug>/t/<uuid>`. Nobody can
say a UUID aloud or type one, and the slug in the path broke the link whenever
an org was renamed. So a task is named by a short number, `#1234`, and its page
is `/t/1234`.

## The number is counted across the instance, not per org

Tusker's main pages mix orgs: the unified board, plan mode and the week page.
A number counted per org would repeat on those pages, so it would need an org
prefix (`ACME-42`), and that is a new org field with its own rules for who sets
it, whether it changes and whether it is unique. A number counted across the
instance names one task by itself, and the org chip already says which org.

The cost is gaps. An org sees its own tasks jump from `#40` to `#57`, and a
member can tell roughly how busy the other orgs are. A self-hosted instance
holds a few orgs that know each other, so we accept that.

## The number is the id

The UUID is gone. `tasks.id` is an integer the database assigns, and every
table that points at a task holds that integer: assignees, plans, week sets and
decisions. One id is simpler than a hidden UUID with a number beside it, which
every query and every link would then have to keep apart.

The number is guessable, and a UUID was not. That changes nothing about who can
read a task: membership is still the only permission check. `/t/<n>` gives the
same 404 for a task the person may not read and for one that does not exist,
so the page says nothing about which numbers are taken.

## A number is never handed out twice

The counter only moves forward. A deleted task leaves a gap, and its number is
never given to another task, so `#1234` means the same task forever. A plain
SQLite rowid hands out the highest current id plus one, which reuses the number
of a deleted newest task, so the column is `AUTOINCREMENT`.

## Consequences

Tasks that already existed were numbered once, in `created_at` order with ties
broken by the old UUID, and the migration rewrote every table that pointed at
them. `plans.task_ids` is a JSON array, so the migration rewrote those too.

Old `/o/<slug>/t/<uuid>` links are a 404. None had gone outside the app, so
nothing redirects them.

The task API's `id` is now a number, not a string. blrhikes-app changes with it.
