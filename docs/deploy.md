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

Every field on that page, build variables included:

| Field | Value | Why |
| --- | --- | --- |
| Git repository | `codeuncodeco/tusker-web` | |
| Git branch | `main` | |
| Root directory | `/` | |
| Build command | `pnpm run build` | Writes `build/server/wrangler.json`, with the environment already resolved |
| Deploy command | `pnpm run deploy:ci` | Applies the migrations to the dev D1, then deploys that resolved config |
| Build caching | on | |
| Build variable `CLOUDFLARE_ENV` | `dev` | Tells the Cloudflare Vite plugin which `wrangler.jsonc` environment to resolve |

`CLOUDFLARE_ENV` is the only build variable, and it is a plain variable, not a
secret. The `build` script defaults it to `dev`, so the build works without it.
Set it anyway. A build that resolves no environment writes a config named
`tusker-web` with no D1 binding, and the deploy then goes to the wrong Worker.

Cloudflare installs the dependencies itself. It reads the package manager from
the `packageManager` field in `package.json` and the Node version from
`.node-version`, so you do not need an install command.

Do not add `--env` to the deploy. The build already resolved it.

**The deploy command must be `pnpm run deploy:ci`, not a bare `wrangler deploy`.**
A bare deploy ships the code and leaves the database behind: the migrations never
run, and the new Worker meets the old schema. A build log that holds no
`d1 migrations apply` line is this mistake.

`wrangler` reads `CLOUDFLARE_ENV` as well, so the deploy scripts drop it with
`env -u`. Without that, wrangler resolves the environment a second time over an
already resolved config, and the Worker name becomes `tusker-web-dev-dev`.
Workers Builds overrides the name and the deploy still lands, but the same
command from your machine makes a second Worker.

The D1 binding lives in `wrangler.jsonc`, so it travels with the repository.

### The build's API token

**Workers & Pages → tusker-web-dev → Settings → Build → API token.**

The token Cloudflare makes for you covers Workers Scripts, KV, R2 and Routes. It
does **not** cover D1, so `deploy:ci` stops at the migration with a permission
error. Edit the token and add **D1 (Edit)** for this account.

The build then runs the migration and the deploy under the one token, and no
token needs to sit in a build variable.

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

## The first account

`/bootstrap` makes it. The page is open while the `user` table is empty, and it
answers 404 from the moment the first account lands. It asks for a name, an
email and a password, and it signs you in, so the first person does not wait on
mail.

**Open it as soon as the first deploy is up.** Until you do, the page is public,
and whoever posts to it first owns the instance. The window is yours to keep
short. A `/` on an empty instance shows the link, so nothing is hidden.

Every account after the first comes from `POST /api/invite`:

```sh
curl -X POST https://<host>/api/invite \
  -H "authorization: Bearer $INVITE_TOKEN" \
  -H "content-type: application/json" \
  -d '{"email":"bo@example.com","name":"Bo","password":"a long one"}'
```

The password is optional. With no password the person signs in by link or code.

## Migrations

A push runs them. `deploy:ci` migrates first and deploys second, so the schema
is ready before the new Worker serves a request. The old Worker keeps serving
until then, and it must not meet a column that has already gone.

That order makes one rule: **a migration may only add.** Write the column, ship
it, and drop the old one in a later push. A migration that drops a column in the
same push breaks the Worker that is still serving.

`wrangler d1 migrations apply` skips its confirmation in a non-interactive
shell, and it takes a backup before it starts. A migration that fails rolls
back, and the deploy never runs, because `deploy:ci` chains the two with `&&`.

A deploy from your machine does not migrate. Run it yourself first:

```sh
pnpm run db:migrate:dev
pnpm run deploy
```
