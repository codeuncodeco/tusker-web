-- A person's ask to become a member of one org, sent from the org directory.
-- See ADR-0028.
--
-- One row per person per org. A waiting row is the ask; a declined row stays,
-- so the person cannot ask that org again. Approval deletes the row as it adds
-- the membership, and so does an invitation, so a person taken out later is
-- not held to an old decline.
CREATE TABLE join_requests (
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'declined')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (org_id, user_id)
);

CREATE INDEX join_requests_user_id_idx ON join_requests (user_id);
