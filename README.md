# tusker-web

Tusker is a keyboard-first task board for several orgs at once.
[CONTEXT.md](./CONTEXT.md) holds the language, [docs/plan.md](./docs/plan.md)
holds the phases, and [docs/adr/](./docs/adr/) holds the decisions.

This is the walking skeleton: one route, one D1 database, one migration, on
Cloudflare Workers.

## Stack

React Router v8 in framework mode, Tailwind 4, TypeScript. A Cloudflare Worker
serves the app and holds the D1 binding. Vitest runs tests inside the Workers
runtime. One environment, `dev`.

## Requirements

- Node 22.22 or later (`.node-version` pins the Cloudflare build to 22.22.0)
- pnpm 10
- A Cloudflare account, with `pnpm exec wrangler login` done once

## Run

```sh
pnpm install
pnpm run db:migrate:local    # build the schema in the local D1
pnpm dev                     # http://localhost:5173
```

`pnpm dev` runs the app in the Workers runtime through the Cloudflare Vite
plugin, against a local D1 file under `.wrangler/state`.

## Migrate

Migrations are plain SQL in `migrations/`, numbered and applied in order.

```sh
pnpm run db:migrate:local    # local D1
pnpm run db:migrate:dev      # the dev D1 on Cloudflare
```

To add one, write `migrations/000N_<what_it_does>.sql`, then run both commands.

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

The `dev` environment is the Worker `tusker-web-dev`.

### Deploy from GitHub

The Worker is also wired to Workers Builds. See
[docs/deploy.md](./docs/deploy.md) for the build command, the deploy command and
the variables the dashboard needs.

## Layout

| Path | Holds |
| --- | --- |
| `app/` | Routes, loaders and the server-only modules they call |
| `workers/app.ts` | The Worker entry. It puts the Cloudflare bindings on the router context |
| `migrations/` | Numbered SQL migrations for D1 |
| `test/` | Vitest tests, run inside the Workers runtime |
| `wrangler.jsonc` | The Worker and its bindings, per environment |
