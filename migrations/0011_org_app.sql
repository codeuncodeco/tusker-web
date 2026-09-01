-- A refs key opens an org app, not one list of it. The org app hashes the
-- bearer and never reads which list was asked for, so one key already opened
-- every list that app serves. Holding one key per field taught the wrong
-- model, and made rotation one edit per field: paste it into one and forget
-- the other, and one picker keeps working while the other stops.
--
-- So the org holds the org app's address and its key, and a reference field
-- names only the list.
--
-- This says one org names one org app. An org reading trails from one app and
-- events from another cannot be expressed. The fix then is a connection table:
-- a record per app, holding a base and a key, with a field naming a connection
-- and a path. That is not built now, because there is one org app, and a
-- table, a screen and a migration buy nothing today that two columns do not.
ALTER TABLE orgs ADD COLUMN refs_base_url TEXT NOT NULL DEFAULT '';
ALTER TABLE orgs ADD COLUMN refs_key TEXT NOT NULL DEFAULT '';

-- The backfill reads the first reference field of each org: the origin and the
-- shared prefix become the org's base URL, and the key becomes the org's key.
-- One org, one app, two fields today, so this is exact. A wrong backfill shows
-- as a failed pull with a readable reason, and one paste fixes it.
--
-- `rtrim(url, replace(url, '/', ''))` cuts the last segment off a URL: it
-- strips every trailing character that is not a slash, and stops at the last
-- slash. A second rtrim drops that slash.
UPDATE orgs SET
  refs_base_url = coalesce((
    SELECT rtrim(rtrim(f.source_url, replace(f.source_url, '/', '')), '/')
    FROM org_fields f
    WHERE f.org_id = orgs.id AND f.type = 'reference' AND f.source_url <> ''
    ORDER BY f.position, f.key LIMIT 1
  ), ''),
  refs_key = coalesce((
    SELECT f.refs_key
    FROM org_fields f
    WHERE f.org_id = orgs.id AND f.type = 'reference' AND f.source_url <> ''
    ORDER BY f.position, f.key LIMIT 1
  ), '');

-- What is left of each field's URL is the segment that names its list.
ALTER TABLE org_fields RENAME COLUMN source_url TO refs_path;

UPDATE org_fields
SET refs_path = substr(refs_path, length(rtrim(refs_path, replace(refs_path, '/', ''))) + 1)
WHERE type = 'reference' AND refs_path <> '';

ALTER TABLE org_fields DROP COLUMN refs_key;
