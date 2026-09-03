# An org colour is assigned, not derived

The unified board, plan mode and the week page mix tasks from every org a person
belongs to. Each row named its org as small uppercase text, and text is slow to
scan. A colour tells one org from another at a glance.

The machinery is already here. ADR-0006 gave the value of a reference field a
colour, with one grammar: a palette name or an exact colour, a leading `#`
telling the two apart. An org colour reuses `readColor`, `colorCss`, `PALETTE`
and `Dot`. There is no second grammar and no second palette.

## The colour is a column on the org

One org holds one colour, so `orgs.color` is the shape. A table would let an org
hold several and answer no question anybody asks.

Null means nobody chose, and such an org draws grey. Grey is drawn and never
stored: a cleared box writes null, and `colorCss` already resolves an unknown
name to grey. The chip therefore keeps one shape, and null keeps its one
meaning.

## A new org is given a colour

An org with no colour is an org nobody can tell apart, and a screen a person has
to visit before a feature works is a screen most people never visit. So Tusker
assigns one: the first palette name, grey excluded, that no other org of the
maker already holds. It wraps round by the count when the person runs out. This
runs where an org is made — the New org page, and the personal org signup makes.

The migration backfills the rows already here: it walks `orgs` in `created_at`
order and cycles the same palette, grey excluded.

## Why this is not the colour ADR-0006 rejected

ADR-0006 rejected a derived option colour: hash the external id into a fixed
palette. That is not this, and three things separate them.

The colour is one row a person changes. A derived colour gives nobody a choice.
This is a stored default, and the settings page overwrites it. Once a person
saves, nothing recomputes it.

It is picked against what the person already holds, not by a hash. A hash
collides at random, and two clients then wear one colour with no way out. This
walks a list and takes the first free name, so a collision needs the person to
run out of palette first.

The set is small. An org app names hundreds of clients, and a person belongs to
a handful of orgs. Eight assignable names cover the real case, and the wrap is
the edge, not the rule.

## Any member may set it

Membership is the only permission check Tusker has, and the colour is decoration.
Nothing sorts, groups or filters by it, so nothing is lost when a member changes
it.

## Consequences

`OrgChip` is one component: a pill holding a `Dot` and the org name. The dot is
`aria-hidden`, so a reader still reads the name alone. The unified card, the
plan and week rows, and the quick-add box draw it.

The header takes the dot alone, because a menu row is not a chip: one before
every org in the switcher, and one before the current org's name in row 1.

An org page draws no chip. There is one org there and nothing to tell apart.

An org that holds a name a later palette drops draws grey and throws no page
away, which is the rule ADR-0006 already set for an option colour.
