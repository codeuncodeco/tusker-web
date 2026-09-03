-- An org carries a colour, so a cross-org page tells one org from another at a
-- glance. The unified board, plan mode and the week page mix tasks from every
-- org a person belongs to, and text is slow to scan. See #138 and ADR-0020.
--
-- One org holds one colour, so a column is the shape and not a table. The
-- grammar is the option colour's: a palette name or an exact colour, in one
-- column, with a leading `#` telling the two apart. See ADR-0006.
--
-- Null means nobody chose. Such an org draws a grey dot, and grey is drawn and
-- never stored, so a cleared box writes null and the chip keeps one shape.
ALTER TABLE orgs ADD COLUMN color TEXT;

-- The rows already here take a colour too, or every old org would draw grey
-- while every new one draws a name. This walks the whole table in created_at
-- order and cycles the palette, grey excluded, as a new org does per person.
--
-- The CASE is a frozen snapshot of `ASSIGNABLE` in `app/colors.ts`, taken the
-- day this ran. A migration is history and cannot import it. A later rename of
-- a palette name leaves this arm alone, and `colorCss` draws the dropped name
-- grey. `test/org-color.test.ts` reads this statement from the file, so the
-- snapshot and the palette are checked against each other and not by eye.
UPDATE orgs
SET color = (
  SELECT CASE walked.at
    WHEN 0 THEN 'red'
    WHEN 1 THEN 'orange'
    WHEN 2 THEN 'amber'
    WHEN 3 THEN 'green'
    WHEN 4 THEN 'teal'
    WHEN 5 THEN 'blue'
    WHEN 6 THEN 'purple'
    ELSE 'pink'
  END
  FROM (
    SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at, id) - 1) % 8 AS at FROM orgs
  ) AS walked
  WHERE walked.id = orgs.id
);
