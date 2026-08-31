-- The key an org app sends to Tusker to read its tasks. Tusker verifies that
-- read, so Tusker mints the key and holds it hashed. See ADR-0005.
--
-- A key names an org and no person. Crew read an org app's task screen, and
-- crew are not Tusker accounts.
--
-- The plaintext is shown once, at the mint. The row keeps its SHA-256 hash and
-- the first characters of it, so a person can tell one key from another on the
-- settings screen without the key itself being readable anywhere.
--
-- A revoked key keeps its row. The row is the record that the key existed, and
-- a deleted row could be minted again by chance.
CREATE TABLE org_keys (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  hash       TEXT NOT NULL UNIQUE,
  preview    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked_at TEXT
);

-- The settings screen reads one org's keys, newest first.
CREATE INDEX org_keys_org_idx ON org_keys (org_id, created_at);
