-- A reference field points at a record in an org app: a trail, an event. The
-- task stores the external id and the board shows the label.
--
-- The declaration carries where to read the options from and the refs key to
-- read them with. The org app mints that key, so Tusker only holds it, beside
-- the field it belongs to. A Worker secret holds one value and does not
-- survive a second org app. See ADR-0005.
--
-- SQLite cannot widen a CHECK, so the table is rebuilt to name the fourth
-- type. Nothing references org_fields yet, so the rebuild copies and renames.
CREATE TABLE org_fields_new (
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  label        TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('text', 'select', 'date', 'reference')),
  options      TEXT NOT NULL DEFAULT '[]',
  source_url   TEXT NOT NULL DEFAULT '',
  refs_key     TEXT NOT NULL DEFAULT '',
  refs_pulled_at TEXT,
  show_on_card INTEGER NOT NULL DEFAULT 0 CHECK (show_on_card IN (0, 1)),
  filterable   INTEGER NOT NULL DEFAULT 0 CHECK (filterable IN (0, 1)),
  position     REAL NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (org_id, key)
);

INSERT INTO org_fields_new (org_id, key, label, type, options, show_on_card, filterable, position, created_at)
SELECT org_id, key, label, type, options, show_on_card, filterable, position, created_at FROM org_fields;

DROP TABLE org_fields;

ALTER TABLE org_fields_new RENAME TO org_fields;

-- The cached {id, label} rows of one reference field. A picker reads this
-- table, so it never waits on the org app.
--
-- A field that was never pulled holds no row here, and so does a field the org
-- app answered with an empty list. `org_fields.refs_pulled_at` tells the two
-- apart, which is what stops an empty dropdown reading as "this app has no
-- trails".
CREATE TABLE org_ref_options (
  org_id     TEXT NOT NULL,
  field_key  TEXT NOT NULL,
  ext_id     TEXT NOT NULL,
  label      TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (org_id, field_key, ext_id)
);
