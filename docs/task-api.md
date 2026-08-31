# The task API for org apps

Tusker holds every task row ([ADR-0001](./adr/0001-tusker-owns-every-task-row.md)).
An org app that shows tasks reads them from here. It keeps no copy and no
mirror: when Tusker is down, the task screen fails and says so.

## The key

A member of the org mints a key at `/o/<slug>/settings`. Tusker shows the
plaintext once and keeps a SHA-256 hash of it, so nothing can read it back. The
same screen revokes a key.

A key names an org, not a person. Crew who read a task screen in an org app are
not Tusker accounts. Tusker verifies the read, so Tusker mints the key. See
[ADR-0005](./adr/0005-the-side-that-verifies-mints-the-key.md).

Every key starts with `tskr_`.

## The read

```
GET /api/tasks
Authorization: Bearer tskr_…
```

The answer holds the org's live tasks, in the order of their columns.

```json
{
  "org": { "slug": "blrhikes", "name": "blrhikes" },
  "tasks": [
    {
      "id": "0f3c…",
      "title": "Book the bus",
      "description": "",
      "status": "todo",
      "position": 1.5,
      "due_date": "2026-09-14",
      "data": { "trail": "skandagiri" },
      "created_at": "2026-09-01T04:11:02.331Z",
      "updated_at": "2026-09-01T04:11:02.331Z"
    }
  ]
}
```

`data` holds the custom field values, keyed by the key the org declared. A
reference field holds the external id the org app minted, not Tusker's cached
label: the org app names its own records better than the cache does.

Archived tasks stay out, as they do on the board.

## The filters

| Query               | Narrows to                                                     |
| ------------------- | -------------------------------------------------------------- |
| `status=todo`       | One status. Repeat the name for more than one                   |
| `field.<key>=<value>` | The tasks whose custom field `<key>` holds `<value>`          |

Two filters read as "and". `?status=todo&status=in_progress&field.trail=skandagiri`
answers the To do and In progress tasks of that trail.

The statuses are `backlog`, `todo`, `in_progress`, `done` and `cancelled`.

## The answers

| Status | Means                                                                   |
| ------ | ----------------------------------------------------------------------- |
| 200    | The tasks, as above                                                     |
| 400    | A status Tusker does not draw, or a field the org does not declare       |
| 401    | No key, a key nothing matches, or a revoked key                          |

A 400 carries `{ "error": "…" }` that names what was wrong. A 401 says nothing
more, because a caller learns nothing from which of the three it was.

## Writes

There are none. An org app that wants a task written sends a person to Tusker.
