-- One value of a reference field carries a colour, so a card tells one client
-- from another at a glance. Tusker owns the colour: a refs endpoint answers
-- {id, label} rows and nothing else. See ADR-0006.
--
-- The row is keyed by the stored value, not by a cached option. A pull writes
-- org_ref_options whole, so a colour kept there would go with the option the
-- org app dropped. A colour outlives its option instead: a task that still
-- holds the id keeps its dot, and a restored client keeps the colour it had.
--
-- The colour is a palette name or an exact colour, in one column. The leading
-- `#` tells the two apart.
CREATE TABLE org_field_colors (
  org_id     TEXT NOT NULL,
  field_key  TEXT NOT NULL,
  value      TEXT NOT NULL,
  color      TEXT NOT NULL,
  PRIMARY KEY (org_id, field_key, value),
  FOREIGN KEY (org_id, field_key) REFERENCES org_fields(org_id, key) ON DELETE CASCADE
);
