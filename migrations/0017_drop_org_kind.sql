-- There is one kind of org. Tusker makes none at signup, and an org that holds
-- only its maker is an org like any other. See ADR-0024.
--
-- The orgs that were personal keep their rows, their tasks and their one
-- member. Nothing but the column goes: whether an org draws an assignee is now
-- read from how many members it holds, not from what it was called once.
ALTER TABLE orgs DROP COLUMN kind;
