# Custom fields instead of a union schema

Every org needs fields the others do not. blrhikes links a task to a trail or an
event. codeuncode tracks a client and a project. The extension put all of them in
one table as nullable columns (`event_id`, `trail_id`, `client`, `project`,
`kind`). That works for two orgs and turns the table into a landfill at four.

An org now declares its own custom fields. The types are text, select, date and
reference. A value lives in the task's JSON column. A reference field points at
records in that org's app, such as trails. Tusker caches the `{id, label}` list
from a refs endpoint and reads the cache when a person opens a picker, so a
picker never waits on the network. An id that the cache does not hold falls back
to one live lookup.

We keep a code plugin as the escape hatch for an org that needs live data, custom
UI, or a rule the generic engine cannot state. We expect few of them.

## Consequences

`client`, `project`, `trail`, `event` and `kind` are org-declared fields, not
core columns. The extension's rule "a trail makes the task ops work" becomes a
declarative rule or a plugin.

A generic engine has to carry two extras the extension had for free: a reference
field can hold a color, and one field can derive its value from another. Both are
general, so both belong in the engine.

D1 is SQLite with JSON1, so a JSON value is queryable, and a generated column can
index a field that filters often.
