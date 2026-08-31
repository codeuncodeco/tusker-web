-- An org declares its own fields. The value lives in the task's JSON `data`
-- column under `key`, so a field costs a row here and no column there.
--
-- The check names the types Tusker renders. A type the app cannot draw is a
-- row no screen can show, so the schema states the same three the code does.
CREATE TABLE org_fields (
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  label        TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('text', 'select', 'date')),
  options      TEXT NOT NULL DEFAULT '[]',
  show_on_card INTEGER NOT NULL DEFAULT 0 CHECK (show_on_card IN (0, 1)),
  filterable   INTEGER NOT NULL DEFAULT 0 CHECK (filterable IN (0, 1)),
  position     REAL NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (org_id, key)
);
