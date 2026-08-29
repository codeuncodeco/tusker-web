# tusker-web

Tusker is a keyboard-first task board for several orgs at once.
[CONTEXT.md](./CONTEXT.md) holds the language, [docs/plan.md](./docs/plan.md)
holds the phases, and [docs/adr/](./docs/adr/) holds the decisions.

Sign-in runs on better-auth over D1, with three ways in: a password, a magic
link and an email code. Resend sends the mail. There is no public signup.

## Stack

React Router v8 in framework mode, Tailwind 4, TypeScript. A Cloudflare Worker
serves the app and holds the D1 binding. better-auth holds the sessions, Resend
sends the mail. Vitest runs tests inside the Workers runtime. One environment,
`dev`.

## Requirements

- Node 22.22 or later (`.node-version` pins the Cloudflare build to 22.22.0)
- pnpm 10
- A Cloudflare account, with `pnpm exec wrangler login` done once

## Run

```sh
pnpm install
cat > .dev.vars <<'VARS'
BETTER_AUTH_SECRET="any-long-string-for-local-work"
INVITE_TOKEN="any-other-long-string"
VARS
pnpm run db:migrate:local    # build the schema in the local D1
pnpm dev                     # http://localhost:5173
```

`pnpm dev` runs the app in the Workers runtime through the Cloudflare Vite
plugin, against a local D1 file under `.wrangler/state`. `.dev.vars` holds the
local secrets, and git ignores it.

`RESEND_API_KEY` stays unset locally, so mail goes to the terminal instead of to
a person. The link and the code are both in that log line.

## Sign in

Three ways in, all of them for an account that already exists:

- a password
- a magic link
- a six-digit code, in the same message as the link

The link and the code ride in one mail, because mail latency is the reason a
code exists at all. A forgotten password goes out as a reset link.

Tusker has no public signup. Every way in refuses an email no account holds.

### Make an account

`POST /api/invite` makes one. It answers only when `INVITE_TOKEN` is set and the
request carries it, so an environment with no token has no endpoint.

```sh
curl -X POST http://localhost:5173/api/invite \
  -H "authorization: Bearer $INVITE_TOKEN" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","name":"You","password":"a long one"}'
```

The new account gets its personal org and its membership row in the same batch,
so the person can make a task straight away.

## Migrate

Migrations are plain SQL in `migrations/`, numbered and applied in order.

```sh
pnpm run db:migrate:local    # local D1
pnpm run db:migrate:dev      # the dev D1 on Cloudflare
```

To add one, write `migrations/000N_<what_it_does>.sql`, then run both commands.

`migrations/0002_better_auth.sql` is generated. After a better-auth upgrade or a
plugin change, write it again:

```sh
pnpm run auth:schema > migrations/0002_better_auth.sql
```

## Test

```sh
pnpm test
```

Each test worker starts with the migrations applied to a throwaway D1, so a test
reads the same schema the app does.

## Typecheck

```sh
pnpm run typecheck
```

This regenerates `worker-configuration.d.ts` from `wrangler.jsonc` and the route
types from `app/routes.ts`, then builds the TypeScript project references.

## Deploy

```sh
pnpm run deploy
```

The build writes a resolved config to `build/server/wrangler.json`, and the
deploy reads it.

Two traps:

- Run `pnpm run deploy`, not `pnpm deploy`. The second is a built-in pnpm
  command.
- Do not run `wrangler deploy` by hand. It reads `wrangler.jsonc`, which has no
  D1 binding at the top level and points `main` at TypeScript that only the Vite
  build can resolve.

The `dev` environment is the Worker `tusker-web-dev`. It needs three secrets.
See [docs/deploy.md](./docs/deploy.md).

### Deploy from GitHub

The Worker is also wired to Workers Builds. See
[docs/deploy.md](./docs/deploy.md) for the build command, the deploy command and
the variables the dashboard needs.

## Layout

| Path | Holds |
| --- | --- |
| `app/` | Routes, loaders and the server-only modules they call |
| `app/auth.server.ts` | The better-auth options and the per-request instance |
| `scripts/` | Build-time scripts. `auth-schema.ts` writes the better-auth SQL |
| `workers/app.ts` | The Worker entry. It puts the Cloudflare bindings on the router context |
| `migrations/` | Numbered SQL migrations for D1 |
| `test/` | Vitest tests, run inside the Workers runtime |
| `wrangler.jsonc` | The Worker and its bindings, per environment |
