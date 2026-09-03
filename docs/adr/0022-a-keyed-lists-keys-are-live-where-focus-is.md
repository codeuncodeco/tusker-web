# A keyed list's keys are live only where focus is

Amends [ADR-0015](./0015-a-drop-names-a-column-not-a-place.md) and
[ADR-0016](./0016-the-org-board-takes-the-same-keys.md). "The keys are the first
way" still holds. It is narrowed by one clause: in the list that holds the
focus.

Every list key sat on `window`. `j`, `x`, `p` and `n` were live on the whole
page, all the time, and one guard stood between them and the person: a press in
a box or under a raised prompt is not the page's. Two things followed.

The arrows could not be added. `ArrowUp` and `ArrowDown` are what a person
reaches for to move a cursor, and they are the only scroll keys a keyboard-only
person has. Bound on `window` and stopped with `preventDefault`, they take page
scroll away everywhere a list is drawn.

And the single-character keys sat outside WCAG 2.1.4, *Character Key Shortcuts*
(Level A): a shortcut on a single character key must be one a person can turn
off, one they can remap, or one that is active only while the component that
owns it has the focus. Tusker's
keys were none of the three, so a speech-input user saying a word into the page
fired `n`, `x` or `p`.

One decision answers both. A keyed list is an element on the page, it takes the
focus, and its keys are live only while the focus is inside it.

## The list is the element that holds the rows

A keyed list wraps rows and nothing else. It takes `tabindex="0"` and an
`aria-label`, and it takes no `role`.

A board draws five of them, one per column, and they share one cursor and one
binding: one hook, spread on every element it binds. That is what keeps the
rule true on a board. The board's quick-add box sat inside the element the keys
would have been bound to, and a box inside a keyed list is a box whose every
typed word is a press the page could read. So the rule is flat, and it holds on
all five surfaces: a box is never inside a keyed list.

The listener reads bubbling `keydown`, so `x` still works while the focus sits
on a row's own button. Anything narrower silently disarms the list under a person who
is operating it with the keyboard.

## No widget role

`role="listbox"` is the shape that would speak the cursor, and it is not legal
here: an `option` must hold no focusable descendant, and a row holds a Link and
four buttons. `role="grid"` is the legal shape for rows that carry controls, and
it is a much larger change — every cell takes a role, Tab means something new
inside a row, and the cursor stops being React state.

So this decision claims no role at all. The container is a named, focusable
element; the cursor stays React state, drawn with `aria-current`, as it was.
The grid is the endpoint if a spoken cursor is ever wanted. It is a separate
decision, not a consequence of this one.

## The list takes the focus when the page arrives, and names no card

Keys are live the moment a page draws, so keyboard-first survives the change,
and a client-side navigation into a keyed page arms the keys the way a load
does. The focus goes to the container and never to a card: focusing a card would
make a screen reader announce a task nobody asked for on every page load, and
the empty cursor (ADR-0015) is the load state this app already chose.

It fires once for each page and never on a re-render of the same one. A fetcher
answering must not pull the focus out of the button a person is working, and a
walk from one day to the next is another page, drawn by the same component, that
has to arm its own keys.

`Escape` keeps its meaning: it empties the cursor, and the focus stays in the
list. No key throws the focus out, so no key is needed to bring it back. A
person leaves with Tab or a click, and returns the same way.

## Arrows navigate, letters act

`ArrowUp` and `ArrowDown` are aliases of `k` and `j` in `app/key-map.ts`, so a
key still has one home. On a board, `ArrowLeft` and `ArrowRight` move the
cursor across the columns, and `<` and `>` still move the card.

One home means one table, so the org board's map now reads its letters from
`app/key-map.ts` as the cross-org map always did, and `n` takes a row there
beside the offer it collides with. ADR-0016 keeps what it decided: the two maps
stay apart, because what a press means on that board, and what it posts, is
that board's own. Only the letters are shared, which is what ADR-0016 said they
were.

A list swallows its arrows whenever the focus is in it, the ends of the list and
of the row of columns included. A key that scrolls the page at the foot of a
list and moves the cursor everywhere else is two keys wearing one label. Page
scroll stays on `PageUp`, `PageDown` and `Space`, and Tab still leaves.

## `n` comes in from the window

`n` focuses the quick-add box, and it was the worst of the four: a speech-input
user's next sentence landed in a task title. It takes the same scope. The box
says it is this surface's box, the keyed list reads the press while it holds the
focus, and the focus moves to the box.

Focus mode is the one page where `n` means something else — the offer that ends
a batch takes three more — and that offer is drawn only when the batch is empty,
which is when the page draws no list to hold the focus. So the offer keeps its
own binding, and the collision is what it was before this decision.

## Consequences

A cursor move is announced to nobody. There is no live region on `j`, on
purpose: a region that speaks on every press talks over the person and cannot be
turned off, and the cursor is drawn state, not a spoken one. That silence is the
thing a later reader will want to fix, and the fix is the grid, not a live
region.

The focus is load-bearing now, so anything that takes it must give it back. The
decision prompt does: it returns the focus to the list it was taken from, which
on a board is the column the person was working.
A row control that removes its own row — Finish on a card, which moves it to
another column — takes the focus with it, and the person Tabs or clicks back in.
Keys pressed on the container, which is where the focus sits after a load, are
untouched by that.

Every surface takes `tabindex="0"` on each list it draws, so a board is five
more tab stops than it was. That is also how a person reaches a column with no
card in it: the arrows carry the cursor from card to card, and Tab walks the
five lists whether they hold a card or not.

The row controls stay in the tab order: taking them out would strand a person
who does not know the letters, and there is no screen that teaches the keys yet.

2.1.4 is met by focus scope alone. No key can be turned off and no key can be
remapped, because focus scope needs no setting and no screen to hold one.
