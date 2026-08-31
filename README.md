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
local secrets, and git ignores it. [Environment](#environment) lists every
variable.

`RESEND_API_KEY` stays unset locally, so mail goes to the terminal instead of to
a person. The link and the code are both in that log line.

## Environment

Four names, in three places. A name means the same thing everywhere.

| Name                 | Holds                                                                                      | Without it                                           |
| -------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `BETTER_AUTH_SECRET` | A long random string. It signs the sessions and the sign-in tokens                         | No sign-in works                                     |
| `RESEND_API_KEY`     | The Resend key                                                                             | Mail goes to the log, not to a person                |
| `INVITE_TOKEN`       | The bearer token that `POST /api/invite` demands                                           | That endpoint answers 404, so no account can be made |
| `MAIL_FROM`          | The `From` address, such as `Tusker <tusker@codeuncode.com>`. Resend must hold that domain | Resend refuses the message                           |

The refs key an org app calls for is not on this list, and does not become one.
It lives on the reference field that uses it, because a secret holds one value
and two org apps need two keys. See [ADR-0005](./docs/adr/0005-the-side-that-verifies-mints-the-key.md).

### On your machine

`.dev.vars`, which git ignores:

```sh
BETTER_AUTH_SECRET="any-long-string-for-local-work"
INVITE_TOKEN="any-other-long-string"
# RESEND_API_KEY stays out, so mail goes to the terminal
```

`MAIL_FROM` comes from `wrangler.jsonc`, so a local run needs no copy of it.

### On the Worker

`MAIL_FROM` is a plain variable in `wrangler.jsonc`. It travels with the
repository, so nobody sets it by hand.

The other three are secrets. Only the Worker can read a secret:

```sh
pnpm exec wrangler secret put BETTER_AUTH_SECRET --env dev
pnpm exec wrangler secret put RESEND_API_KEY --env dev
pnpm exec wrangler secret put INVITE_TOKEN --env dev
```

Set each one once. A secret is not a build variable, and Workers Builds must
never hold it.

### In Workers Builds

**Workers & Pages → tusker-web-dev → Settings → Build.** Three fields to type:

| Field                           | Value                | Why                                                                            |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| Build command                   | `pnpm run build`     | Writes `build/server/wrangler.json`, with the environment already resolved     |
| Deploy command                  | `pnpm run deploy:ci` | Applies the migrations to the dev D1, then deploys                             |
| Build variable `CLOUDFLARE_ENV` | `dev`                | Tells the Cloudflare Vite plugin which `wrangler.jsonc` environment to resolve |

The build's own API token needs **D1 (Edit)** on top of what Cloudflare gives it,
because the deploy applies the migrations. See
[docs/deploy.md](./docs/deploy.md) for that and for the rest of the dashboard
settings.

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

To add one, write `migrations/000N_<what_it_does>.sql`, then run the local
command. A push applies it to the dev D1, because `deploy:ci` migrates before it
deploys. Run `db:migrate:dev` by hand only when you deploy from your machine.

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
pnpm run db:migrate:dev      # the schema first
pnpm run deploy
```

The build writes a resolved config to `build/server/wrangler.json`, and the
deploy reads it. `pnpm run deploy` does not migrate, so run the migration
yourself. The old Worker keeps serving until the new one goes live, so the
schema must be ready first.

Two traps:

- Run `pnpm run deploy`, not `pnpm deploy`. The second is a built-in pnpm
  command.
- Do not run `wrangler deploy` by hand. It reads `wrangler.jsonc`, which has no
  D1 binding at the top level and points `main` at TypeScript that only the Vite
  build can resolve.

The `dev` environment is the Worker `tusker-web-dev`. It needs three secrets.
See [docs/deploy.md](./docs/deploy.md).

### Deploy from GitHub

A push to `main` builds and deploys through Workers Builds. Its deploy command
is `pnpm run deploy:ci`, which applies the migrations to the dev D1 and then
deploys. See [docs/deploy.md](./docs/deploy.md) for the dashboard settings

## Layout

| Path                 | Holds                                                                   |
| -------------------- | ----------------------------------------------------------------------- |
| `app/`               | Routes, loaders and the server-only modules they call                   |
| `app/auth.server.ts` | The better-auth options and the per-request instance                    |
| `scripts/`           | Build-time scripts. `auth-schema.ts` writes the better-auth SQL         |
| `workers/app.ts`     | The Worker entry. It puts the bindings on the router context, and runs the cron |
| `migrations/`        | Numbered SQL migrations for D1                                          |
| `test/`              | Vitest tests, run inside the Workers runtime                            |
| `wrangler.jsonc`     | The Worker and its bindings, per environment                            |
