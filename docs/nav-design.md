# Navigation design

## The problem

Tusker has no global chrome. `app/root.tsx` renders `<Outlet />` and nothing
else, so every header, every back link and every nav is written per route.
Nav is therefore not one thing that is wrong. It is fourteen things that
disagree.

An audit of every page found three chrome patterns:

| Chrome                    | Pages                                          |
| ------------------------- | ---------------------------------------------- |
| `OrgSwitcher` + `OrgNav`  | board only                                     |
| `OrgNav` alone            | fields, decisions, members, settings, task     |
| `OrgSwitcher` alone       | `/me`, `/me/plan`, `/me/focus`                 |
| nothing                   | home, login, bootstrap, reset-password, account, orgs/new |

The board is the only page that carries both. That makes the board a
mandatory waypoint: to leave an org from the members page costs two hops,
board first and the switcher after.

It also found four defects, four orphan or near-orphan routes, and one lie in
a comment. They are listed under [Defects](#defects).

## The shape

The person axis and the org axis are peers. See ADR-0011.

One header, on every signed-in page, with both halves always drawn:

```
[Tusker]   Tasks · Plan · Focus   |   Acme ▾  Board · Decisions  Manage ▾        Account
           ^ person half              ^ org half, on the current org
```

- **Person half**: `Tasks` (`/me`), `Plan` (`/me/plan`), `Focus`
  (`/me/focus`). All three, always. The current page takes no link.
- **Org half**: the current org as a dropdown, then `Board` and `Decisions`
  inline, then a `Manage` menu holding `Fields`, `Members` and `Settings`.
- **Account**: far right, on its own. `Sign out` moves onto the account page.
  `New org` moves into the org dropdown.

Board and decisions are read daily. Fields, members and settings are rare
admin. The header ranks them that way, because "every link has the same
weight" is the complaint that started this work. It also keeps the header one
width, whatever the org holds.

### Why both halves are always drawn

A control that comes and goes teaches nothing. The audit found three of them,
and each is a discovery failure of its own:

- `/me` drops its link to `/me/plan` as soon as a plan exists.
- The board's today chip draws only when a plan exists.
- The task page draws a link to fields only when the org declares none.

A header that is the same on every page is the fix, and the rule the rest of
this design follows.

## The route tree

`app/routes.ts` is flat today. It becomes three layouts, one per kind of page:

| Layout      | Holds                                                    |
| ----------- | -------------------------------------------------------- |
| Signed-out  | `/`, `/login`, `/bootstrap`, `/reset-password`            |
| Person      | `/me`, `/me/focus`, `/me/plan`, `/me/plan/:day`, `/account`, `/orgs/new` |
| Org         | `/o/:slug/board`, `/decisions`, `/fields`, `/members`, `/settings`, `/t/:taskId` |

The signed-out layout draws a wordmark and nothing else. A signed-out person
has one destination, so a header would be five dead links.

The org layout loads the org once, with `orgForMember`, instead of six route
files loading it each for themselves.

`/orgs/new` sits in the person layout, because no org exists yet when a person
opens it. The link into it still lives in the org dropdown.

## The current org

The org half needs a subject on a person page. The current org is that
subject: the org the person visited last.

A session cookie holds it, rewritten on every `/o/:slug/*` visit. Before any
visit the cookie is unset and the header names the personal org.

The cookie, and not `localStorage`, because the header is server-rendered.
`localStorage` draws the wrong org for one frame on every load, and draws
nothing at all without script. `OrgSwitcher` already says it "works without
script", and this keeps that true.

The current org is state, but it is not hidden state: its name is printed in
the header.

## The switcher

A dropdown. Personal org first, then newest first, then `New org` at the foot.

Nothing caps how many orgs a person joins, so the inline list of today cannot
hold. A dropdown holds twenty. Type-to-filter is deliberately left out: it is
a command palette in a dropdown, and palettes are out of scope.

## Defects

Four defects fold into this work. Each has its own ticket.

### 1. Plan mode loses its link when a plan exists

`/me` links to `/me/plan` only while no plan is started, and `/me/focus` links
to it only while the plan is empty. So once a person has a plan, no page links
to the page that holds it.

The person half of the header always carries `Plan`. Fixed by the shape.

### 2. `/me/plan/:day` is unreachable

Nothing builds a dated plan URL. The plan page prints the day as text and
offers no way to another day. The route comment says the page exists "so a
person can read back the day they planned", and no person can reach it.

The plan page grows previous-day and next-day controls, and prints its date as
a link to its own dated URL.

### 3. `/reset-password` is a trap

Arriving with `?error=` shows "That link is wrong or too old. Ask for a new
one", links nowhere, and offers a form that returns the same error every time.

The error text gains a link to `/login`. Separately, `/` redirects a signed-in
person to `/me`, instead of offering them a sign-in link.

### 4. A task cannot return you to where you came from

`Enter` opens a task from `/me`, from plan mode and from focus mode. The task
page draws the five org links and no way back to the list. `Esc` is bound only
while the decision prompt is open. So the keyboard way in has no keyboard way
out.

The task URL carries the origin as `?from=`, validated by the `safeNext` guard
that `app/paths.ts` already holds. `Esc` and a back link both follow it, the
save redirect keeps it, and a missing `from` falls back to the org board.

The origin travels in the URL and not in a cookie, so it survives a reload and
so two tabs cannot fight over it.

## Smaller repairs

- The board's today chip always draws. With no plan for today it links to
  `/me/plan` instead of filtering, so the chip teaches that plans exist.
- `OrgSwitcher` links to `/orgs/new` and `/account` but never to `/me`. The
  person half replaces it.
- Sign-in defaults to `/account`, which draws no chrome at all today. Under
  this design it draws the full header.
- The backlog toggle stays as it is. It is a view control, not nav.

## Known gap

The board holds no keydown handler. Cards move by drag and by arrow buttons.
`app/focus-list.tsx` still says "Focus is keyboard first, like the board",
which is not true.

This design is chrome only. It adds no keyboard route-jumping, no `g`-jumps
and no command palette, because a keystroke you must already know does not
help a person who cannot find the page. Fix the map first. The keyboard layer
is a later piece of work, and the comment stays wrong until then.
