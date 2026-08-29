# Deploy

The `dev` environment is the Cloudflare Worker `tusker-web-dev`, with the D1
database `tusker-dev` bound as `DB`.

- URL: https://tusker-web-dev.forsakenlegacy.workers.dev
- Worker name: `tusker-web-dev` (the `dev` environment of `tusker-web`)
- D1 database: `tusker-dev`, id `f82d4a00-20bb-44ea-95c9-5f9453501781`

## From your machine

```sh
pnpm run deploy
```

## From GitHub, through Workers Builds

Connect this repository to the `tusker-web-dev` Worker in the Cloudflare
dashboard: **Workers & Pages → tusker-web-dev → Settings → Build**.

### Build settings

| Field | Value |
| --- | --- |
| Git repository | `codeuncodeco/tusker-web` |
| Git branch | `main` |
| Root directory | `/` |
| Build command | `pnpm run build` |
| Deploy command | `pnpm exec wrangler deploy -c build/server/wrangler.json` |
| Build caching | on |

Cloudflare installs the dependencies itself. It reads the package manager from
the `packageManager` field in `package.json` and the Node version from
`.node-version`, so no install command is necessary.

The deploy command must point at `build/server/wrangler.json`. The build writes
that file, with the environment already resolved, so `--env` on the deploy would
be wrong.

### Build variables

Set these under **Build variables** (plain variables, not secrets):

| Name | Value | Why |
| --- | --- | --- |
| `CLOUDFLARE_ENV` | `dev` | Tells the Cloudflare Vite plugin which `wrangler.jsonc` environment to resolve |

Nothing else is needed today. The D1 binding lives in `wrangler.jsonc`, so it
travels with the repository.

### Runtime secrets

There are none yet. When one arrives (a Resend key, for example), add it with
`pnpm exec wrangler secret put <NAME> --env dev`, not as a build variable. A
build variable is visible to the build; a secret is visible only to the Worker.

## Migrations are not part of the build

Workers Builds does not run migrations. After a deploy that adds one, run:

```sh
pnpm run db:migrate:dev
```

Apply the migration before you deploy code that reads the new column, because
the old Worker keeps serving until the new one goes live.
