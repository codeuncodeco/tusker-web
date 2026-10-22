# A person carries one colour

Built on the `ui-sandbox` branch. Extends [ADR-0020](./0020-an-org-colour-is-assigned-not-derived.md).

Every assignee drew the same grey pill of initials. On a board of five people
that is five grey pills, and a person reads two letters slower than a colour.
So a person carries a colour, and may carry a picture, and the avatar draws
both.

## One colour across every org

The colour belongs to the person, not to the membership. A person who is blue
in one org and green in another reads as two people on the unified board,
which mixes orgs. So it is one row per account, in `person_colors`, and not a
column on `memberships`.

It is a table and not a column on `"user"`, because better-auth owns that
table and writes its rows.

## Assigned, then changed by hand

As with an org colour, a person nobody has asked about still needs a colour,
and a screen a person must visit first is a screen most never visit. A trigger
on `"user"` gives each new account the next name in a walk of the palette, and
the migration walks the accounts already here the same way. The walk puts
neighbours far apart on the wheel, so the first few people of a small team look
nothing alike. It is a trigger and not a function call because better-auth
makes accounts on paths Tusker runs no code on.

The account page changes it: one click on a swatch saves it.

## The picture is a small data URL in `user.image`

better-auth already keeps `user.image`. The account page cuts the picked file to
a 96px square in the browser and posts a JPEG data URL, a few kilobytes. The
row refuses anything but an image data URL, so no board ever loads an address
off-site because of a picture.

That is right for the sandbox, where everything lives in the browser. On
`main` a picture of every assignee rides every board load, so a store with a
URL (R2) is the better home there. The avatar takes either: it draws whatever
`image` holds.

## Consequences

- `Initials` draws avatars: the picture, or the initials on a tint of the
  colour, ringed in the colour. Several overlap a little.
- Every read of an assignee joins `person_colors` and reads `user.image`.
- Eight colours and more than eight people means a repeat. The initials and the
  picture still tell them apart.
