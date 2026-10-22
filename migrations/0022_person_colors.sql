-- A person carries a colour, so an assignee is told apart at a glance on every
-- card, in every org. One person holds one colour across every org, because a
-- person who is blue in one org and green in another is two people to the eye.
--
-- It is a table of its own and not a column on "user", because better-auth
-- owns that table and writes its rows. The colour's grammar is the option
-- colour's: a palette name or an exact colour. See ADR-0006 and ADR-0020.
CREATE TABLE person_colors (
  user_id TEXT PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
  color TEXT NOT NULL
);

-- The accounts already here take a colour, walked in the order they were made.
--
-- The order is not the org order: neighbours sit far apart on the wheel, so
-- the first few people of a small team look nothing alike. The CASE is a
-- frozen snapshot of the palette, as 0015's is. A migration is history and
-- cannot import `app/colors.ts`.
INSERT INTO person_colors (user_id, color)
SELECT walked.id,
  CASE walked.at
    WHEN 0 THEN 'blue'
    WHEN 1 THEN 'pink'
    WHEN 2 THEN 'green'
    WHEN 3 THEN 'orange'
    WHEN 4 THEN 'purple'
    WHEN 5 THEN 'teal'
    WHEN 6 THEN 'red'
    ELSE 'amber'
  END
FROM (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY createdAt, rowid) - 1) % 8 AS at FROM "user"
) AS walked;

-- An account made after this takes the next colour in the same walk. A trigger
-- and not a function call, because better-auth makes the row on sign-in paths
-- Tusker does not run code on.
CREATE TRIGGER person_color_on_new_user AFTER INSERT ON "user"
BEGIN
  INSERT OR IGNORE INTO person_colors (user_id, color)
  VALUES (
    NEW.id,
    CASE ((SELECT COUNT(*) FROM "user") - 1) % 8
      WHEN 0 THEN 'blue'
      WHEN 1 THEN 'pink'
      WHEN 2 THEN 'green'
      WHEN 3 THEN 'orange'
      WHEN 4 THEN 'purple'
      WHEN 5 THEN 'teal'
      WHEN 6 THEN 'red'
      ELSE 'amber'
    END
  );
END;
