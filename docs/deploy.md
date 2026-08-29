# Deploy

The `dev` environment is the Cloudflare Worker `tusker-web-dev`, with the D1
database `tusker-dev` bound as `DB`.

- URL: https://tusker.codeuncode.com
- Worker name: `tusker-web-dev` (the `dev` environment of `tusker-web`)
- D1 database: `tusker-dev`, id `f82d4a00-20bb-44ea-95c9-5f9453501781`

`wrangler.jsonc` declares `tusker.codeuncode.com` as a custom domain, so the
deploy creates the DNS record and the certificate. Cloudflare serves a custom
domain over HTTPS only. A request to `http://` redirects.

The custom domain turns the `workers.dev` URL off, so
`tusker-web-dev.forsakenlegacy.workers.dev` now answers 404. `preview_urls` is
`true`, which keeps a preview URL for each non-production branch that Workers
Builds builds.

## From your machine

```sh
pnpm run deploy
```

Deploy only through that script. A bare `wrangler deploy`, with or without
`--env dev`, reads `wrangler.jsonc` and fails: the top level has no D1 binding,
and `main` points at TypeScript that only the Vite build can resolve. The build
writes `build/server/wrangler.json`, and that file is the one to deploy.

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
`.node-version`, so you do not need an install command.

The deploy command must point at `build/server/wrangler.json`. The build writes
that file with the environment already resolved. Do not add `--env` to the
deploy.

### Build variables

Set these under **Build variables** (plain variables, not secrets):

| Name | Value | Why |
| --- | --- | --- |
| `CLOUDFLARE_ENV` | `dev` | Tells the Cloudflare Vite plugin which `wrangler.jsonc` environment to resolve |

`CLOUDFLARE_ENV` is the only build variable. The `build` script defaults it to
`dev`, so the build works without it. Set it anyway. A build that resolves no
environment writes a config named `tusker-web` with no D1 binding, and the
deploy then goes to the wrong Worker.

The D1 binding lives in `wrangler.jsonc`, so it travels with the repository.

### Runtime secrets

Set each one with `pnpm exec wrangler secret put <NAME> --env dev`. Do not add
any of them as a build variable. The build can read a build variable. Only the
Worker can read a secret.

| Name | Holds |
| --- | --- |
| `BETTER_AUTH_SECRET` | Signs the sessions and the sign-in tokens. A long random string |
| `RESEND_API_KEY` | The Resend key. Without it the Worker writes the mail to the log |
| `INVITE_TOKEN` | The bearer token that `POST /api/invite` demands. Without it that endpoint answers 404 |

`MAIL_FROM` is a plain variable in `wrangler.jsonc`, not a secret. Resend must
hold the domain it names.

## Migrations are not part of the build

Workers Builds does not run migrations. Run this yourself:

```sh
pnpm run db:migrate:dev
```

Run it before you merge the code that reads the new column. The old Worker keeps
serving until the new one goes live, so the schema must be ready first.
