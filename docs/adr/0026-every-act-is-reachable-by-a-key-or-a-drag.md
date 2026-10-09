# Every act is reachable by a key or a drag

Amends [ADR-0016](./0016-the-org-board-takes-the-same-keys.md) and
[ADR-0015](./0015-a-drop-names-a-column-not-a-place.md). Both said that every
key rides on a button, so no act is reachable by key alone. That rule is
replaced by this one: every act is reachable by a key or by a drag.

Ticket #167 (split from #162). Triage chose no setting: the reorder buttons go,
and Tusker reorders by keys and drag.

## What goes

**The org board.** A card had two arrows that posted `up` and `down`, the
intents `K` and `J` post. They are gone. A card is reordered by drag, which
draws where it will land (ADR-0025), or by `J` and `K`.

**Plan mode.** A row of the plan had Up, Down, Top and Bottom buttons. They are
gone. A row is reordered by drag or by `J`, `K`, `T` and `B`.

**Focus mode** draws its rows with the plan's row, and it never had reorder
buttons. It has none now.

The `up`, `down`, `top` and `bottom` intents stay on the server, because the
keys post them.

Buttons that do not reorder stay: Plan, Finish, Archive, the status select.

## What stays

**The week set** keeps its four buttons. It has no drag. ADR-0025 gave the drag
to the plan and not to the set, and a phone has no keyboard, so the buttons are
the only way a phone reorders the set. #167 was blocked by the drag in plan mode
for the same reason: a button goes where a drag can do its job.

So the rule is drawn from the row and not the page: a ranked row that drags has
no reorder button, and a ranked row that does not drag keeps them. When the set
takes a drag, its buttons go with no further decision.

## Why

A drag and a button that do the same thing on the same row are two controls for
one act, and the button is the worse of the two: it moves one place per press,
and it takes room on every row. ADR-0025 made the drag precise, so the button
added nothing a person could not already do.

The old rule said a key must have a button, so that a person without a keyboard
could do every act. A drag answers that person too, on a mouse and on a touch
screen. So the rule now names what it was for: every act has a way in that
needs no keyboard, or a key, and the keyboard-first acts have both.

## The keys are still named

A button carried its key (`⇧K` on Up), and that was how a person found the key.
A row that drags has no button to carry one. So a list whose rows drag names
its reorder keys once, above the rows: Up `⇧K`, Down `⇧J`, Top `⇧T`, Bottom `⇧B`.
It shows where the pointer is fine, as every other key mark does.

The org board's arrows carried no key mark, but they were the one sign on the
page that a card could step. So the board names its two step keys the same
way, once, under the quick-add box: Up `⇧K`, Down `⇧J`.

## Consequences

The org board no longer steps a card with no script. A drag needs script, and
the keys need script. Plan mode is the same. The week set still works with no
script.

The clear (`Escape`) is no longer an exception. ADR-0015 called it the one act
with no control beside it. Under this rule it needs none: it has a key.
