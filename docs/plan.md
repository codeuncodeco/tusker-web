# Plan

Tusker moves from a Chrome extension to a web app. This page holds the phases and
the v1 data model. The reasons live in [CONTEXT.md](../CONTEXT.md) and
[docs/adr/](./adr/).

## Stack

React Router v8 in framework mode, Tailwind 4, TypeScript. Cloudflare Workers
with one D1 database. better-auth for sign-in, Resend for mail. Vitest for tests.
One environment, `dev`. No R2 in v1.

`markdown.js` and `editor.js` come over from the extension as TypeScript, with
their tests. The editor keeps an uncontrolled textarea inside a thin React
component, because the caret code is the part that is already correct.

## Phase 1 — the thin slice

Prove the architecture end to end on real data: sign in, one org, a board, and
blrhikes trails in a reference field.

1. Cloudflare project, D1, migrations, `wrangler dev`.
2. better-auth on D1: magic link, email OTP and password. Resend for mail.
3. Signup creates a personal org and makes the person its only member.
4. Org, membership, org switcher. Routes are `/o/:slug/...` and `/me`.
5. Task table with `org_id`, status, `position`, due date, assignees, JSON `data`.
6. Board: columns, drag between and inside a column, per-column quick add.
7. Personal rank: dropped. A column holds one order, the org's. See ADR-0006.
8. Custom fields: the declaration table, a generic renderer, and the four types.
9. Reference fields: a cache table, a pull on a schedule and on demand, a live
   lookup for a cache miss.
10. A refs endpoint in blrhikes-app for trails and events, and an org API key.
11. The task API that blrhikes-app reads, with a per-org key.
12. Import the extension's JSON export into the personal and codeuncode orgs.

Before phase 1 ends, dump the `tasks`, `task_comments` and `decisions` rows in
blrhikes-app. Take a JSON backup first.

## Phase 2 — parity

Task popup and the full task page. Comments. Markdown and the editor. Filters and
search. Archive. Manage screens for members and custom fields.

## Phase 3 — the personal layer

Plan mode, focus mode, the unified view in percentile order, decisions and the
decisions log.

## Phase 4 — the rest

The extension stub that redirects a new tab. Backups to R2. Attachments.
Live updates through a Durable Object per org. A production environment.

## Data model, v1

Tables that carry the design. Field lists are indicative, not final.

| Table | Holds |
| --- | --- |
| `user`, `session`, `account`, `verification` | better-auth |
| `orgs` | `id`, `slug`, `name`, `kind` (`personal` or `team`) |
| `memberships` | `org_id`, `user_id`, `role` |
| `tasks` | `org_id`, `title`, `description`, `status`, `position`, `due_date`, `archived`, `assignees`, `data` (JSON) |
| `task_comments` | `task_id`, `author_id`, `body` |
| `decisions` | `org_id`, `title`, `rationale`, `task_id` (nullable) |
| `plans` | `user_id`, `day` (local `YYYY-MM-DD`), ordered task ids |
| `org_fields` | `org_id`, `key`, `label`, `type`, `options`, `source_url`, `refs_key`, `refs_pulled_at`, `show_on_card`, `filterable`, `position`, `derives_from` |
| `org_ref_options` | `org_id`, `field_key`, `ext_id`, `label` (null for a miss), `fetched_at` |
| `org_field_colors` | `org_id`, `field_key`, `value`, `color` |
| `org_api_keys` | `org_id`, hashed org key, `last_used_at` |

Notes that the table does not show:

- `position` is a fraction. A drop between two cards takes the midpoint, so no
  row is renumbered. A column has one order, the org's. See ADR-0006.
- A plan day is a local calendar date. `toISOString()` converts to UTC first, so
  an evening plan east of UTC would land on tomorrow.
- Every query that reads task rows takes the session's org set through one
  helper. Scoping by hand is how a row leaks.
- `derives_from` is not built.
- `org_field_colors` is the extension's client dot, made generic. One value of a
  reference field carries a colour, and a card draws it as a dot. The colour is a
  palette name or `#rgb` or `#rrggbb`, in one column, told apart by the leading
  `#`. A pull writes `org_ref_options` whole, so the colour sits in its own table
  and survives one. A colour outlives the option that is gone. See ADR-0006.
- The two keys point opposite ways. `org_fields.refs_key` is the refs key an org
  app minted, held as plaintext because Tusker sends it. `org_api_keys` holds
  the org key Tusker minted, hashed because Tusker verifies it. See ADR-0005.
