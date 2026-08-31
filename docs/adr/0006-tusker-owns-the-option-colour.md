# Tusker owns the option colour

The extension drew a client dot. One coloured mark on a card said which client a
task belonged to. ADR-0002 kept that mark as a generic feature and wrote that "a
reference field can hold a color". That line puts the colour in the wrong place
twice.

## The colour hangs off the value, not the field

A colour on the field paints every client chip the same blue. The dot then
repeats what the label already says, and it tells no client from another. The
extension had one colour per client, so the colour belongs to the value a task
holds, not to the field that holds it.

The rejected alternative is a colour on the field, with an option colour that
overrides it. A field colour has no reader once every value can carry its own,
so the default would only add a rule.

## Tusker owns it, not the org app

A reference field reads its options from an org app, and Tusker caches the
`{id, label}` rows. The cheap home for a colour is that cache. Widen the refs
endpoint to `{id, label, color}`, and every pull refreshes the colour with the
label. It costs no table and no screen.

We rejected it. The colour says how a Tusker board reads, and the org app is not
the side that reads it. A colour in the contract makes the trail owner decide
what a Tusker card looks like, and it takes the setting away from the person who
wants it changed. It also fixes the feature to reference fields. A select field
holds a local list and no endpoint, so a colour that arrives over the wire can
never reach one.

`CONTEXT.md` says a refs endpoint returns "`{id, label}` rows and nothing else".
That line stands.

The second rejected alternative derives the colour: hash the external id into a
fixed palette. It needs no table and no screen, and it gives every client a
stable colour at once. It also gives nobody a choice, and two clients collide at
random.

So the colour lives in a Tusker table, keyed by the org, the field key and the
stored value. A pull writes the option cache whole and never touches it.

## A colour outlives its option

The CRM deletes a client. The next pull drops the cached row, and the colour row
stays. Nothing reads a colour for a value no task holds, a task that still holds
the id keeps its dot, and a restored client keeps the colour it had. A cron run
is not good enough evidence to discard what a person chose.

## Consequences

`org_fields` gets no `color` column. `docs/plan.md` named one, and that entry was
wrong before it was built.

A colour is a palette name or an exact colour, in one column. A leading `#` tells
the two apart, so the palette names are a closed set and `red` is a palette name
and never a CSS colour name. Tusker takes `#rgb` and `#rrggbb` and rejects every
other CSS colour form, because a Worker has no CSS parser and a value it cannot
read fails as a dot that does not draw.

A named colour resolves to a token with a light and a dark value. An exact colour
draws as the person typed it, in both themes. That is the deal an exact colour
makes.

The colour draws on the board card and beside the value on the task page. A
browser will not style an `<option>`, so the dropdown list stays plain, and a
scripted combobox would cost the no-script move that the board keeps.
