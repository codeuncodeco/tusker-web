-- What an org keeps about one client: the links its people reach for, such as
-- a Figma file, a brief in Google Docs or a Loom, and the notes of its
-- meetings. See ADR-0036 and CONTEXT.md, "Client page".
--
-- `client` is the value tasks store under the org's client field: the option
-- of a select, or the external id of a reference. It is a value and not a key
-- of another table, because a client is a value and not a row (ADR-0002). A
-- value the field stops offering keeps its rows; the page is gone, and the
-- rows come back with the value.
--
-- One table for both kinds, because both are "a thing about this client"
-- that the page lists, counts and deletes the same way. A link holds `url`; a
-- note holds `body`, raw markdown, as a task description does, and `day`, the
-- day the meeting was held.
CREATE TABLE client_resources (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  client     TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('link', 'note')),
  title      TEXT NOT NULL,
  url        TEXT,
  body       TEXT NOT NULL DEFAULT '',
  day        TEXT,
  made_by    TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A page reads one client of one org, a kind at a time.
CREATE INDEX client_resources_client_idx ON client_resources (org_id, client, kind);
