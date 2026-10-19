# An org names its client field

Built on the `ui-sandbox` branch. Builds on [ADR-0002](./0002-custom-fields-instead-of-a-union-schema.md)
and [ADR-0006](./0006-tusker-owns-the-option-colour.md).

An agency works by client. Its people want to see one client's work, tell
clients apart on a card, and keep each client's meeting notes and links where
the work is. A client was already a custom field (ADR-0002), and a value
could already carry a colour (ADR-0006). But the board could not tell the
client field from any other field.

## A flag on one field, not a table of clients

An org marks one select or reference field as the field that names its
client: `org_fields.names_client`. One click on the fields screen sets it, and
setting it clears it on every other field of the org in the same batch.

We kept the client a value of a field, not a core table, for three reasons:

- ADR-0002 still holds. A client is one org's business, as a trail is
  another's. An org with no clients marks nothing and sees nothing new.
- A reference field already reads clients from an org app, and a select
  already holds a short list. A table would be a third list to keep in step.
- The colour already hangs off the value, and so do the new pages. Whatever a
  task stores names the client everywhere: on the card, in the address and on
  the client's page.

## What the flag turns on

- **A tag on every card.** The client draws first, as a coloured tag, whether
  or not it is marked for the card. On the org board the tag opens the
  client's page.
- **A filter on every board.** The client field always filters an org board,
  as one of its field filters, under `field.<key>`. The unified board has no
  field filters, because each org declares its own. It gets one filter for
  clients alone: `client=<slug>:<value>`, with chips across every org that
  names a client field. A value no org offers narrows nothing, so an old link
  opens the whole board.
- **A page per client.** Notes and links, at `/o/<slug>/clients/<value>`. See
  CONTEXT.md, "Client page".

## Option colours for a select

A select's values had no colour screen, only a reference's did. A client field
is more often a select than a reference, so both now draw a row of swatches
per value, and one click saves a colour.
