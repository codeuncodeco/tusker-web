-- An org names one of its fields as the field that holds the client. A client
-- is still a custom field an org declares, not a core table and not an org
-- (ADR-0002): this only says which field it is, so the board can tag a card
-- with it, filter by it on every board, and give each client a page of its
-- own. See ADR-0036.
--
-- A flag on the field and not a column on the org, so every read of the
-- fields already knows which one it is. One field per org holds it; the code
-- that sets it clears the rest in the same batch.
ALTER TABLE org_fields ADD COLUMN names_client INTEGER NOT NULL DEFAULT 0;
