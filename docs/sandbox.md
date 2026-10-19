# The UI sandbox

The `ui-sandbox` branch runs Tusker entirely in the browser. It has no server
data at all. Use it to change the UI without touching the data layer. See #213.

**This branch never merges into `main`.** UI changes made here go back to
`main` as ordinary PRs, rebuilt or cherry-picked there. The storage layer in
`sandbox/` and the config changes listed below stay on this branch.

This branch does not amend ADR-0004. It is a design sandbox, not an offline
mode.

## What a visitor gets

- One person, Sam Sandbox, always signed in. There is no login step. `/` opens
  the unified board.
- Two orgs, Studio and Garden Club, with different org colours. Sam owns both.
- Tasks in every status, an archived task in each org, custom fields with
  option colours, a reference field with a pulled cache, assignees (one with
  no name), a plan for today, a week set and two decisions.
- The data lives only in that browser, in `localStorage`. Each visitor has
  their own copy. Two browsers never share data.
- Studio names a client field with three clients, so cards carry client tags,
  both boards filter by client, and Northside Gallery's client page holds
  links and a meeting note. See ADR-0036.
- Every person carries a colour, and Ana carries a picture. See ADR-0034.
- Both boards open on Mine. See ADR-0035.

A browser that saved its database before a new migration runs the migration
on its next load, but it only gets new sample data after **Reset sample
data**.

## Reset the data

Click **Sandbox** in the bottom-left corner, then **Reset sample data**. This
deletes the browser database. The page reloads and builds it again from the
seed.

## How it works

The route files are the same as on `main`. The build changes how they run:

| Piece | Where | What it does |
| --- | --- | --- |
| D1 adapter | `sandbox/d1.ts` | Implements `prepare`, `bind`, `first`, `all`, `run`, `raw` and `batch` over sql.js (SQLite compiled to WebAssembly). The data functions take it as a `D1Database`. |
| Browser database | `sandbox/database.ts` | Runs every file in `migrations/` on the first load, then the seed. Saves to `localStorage` after each write. A saved database runs any migration it has not seen yet. |
| Seed | `sandbox/seed.ts` | Writes the sample data through the app's own data functions, so it follows the schema. |
| Route rewrite | `sandbox/vite-plugin.ts`, `sandbox/route.ts` | At build time, turns each route's `loader`, `action` and `middleware` into `clientLoader`, `clientAction` and `clientMiddleware`. React Router's SPA mode then runs them in the browser. A route's own `clientAction` (`postAndReport`) gets the local action as its `serverAction`. |
| Session and auth | `sandbox/session.ts`, `sandbox/auth.ts` | Swapped in for `app/session.server.ts` and `app/auth.server.ts`. Every request is Sam. No better-auth code runs. An invitation makes the account in the browser database. |
| Mail | `app/mail.server.ts`, as on `main` | No Resend key is set, so every mail goes to the browser console. `resend` is swapped for a stub that sends nothing. |
| Network | `sandbox/fetch-guard.ts` | A request to an org app's refs list is answered from the cached options, so a refresh succeeds and changes nothing. Every other off-site request fails, as an org app that does not answer. |
| Cookies | `sandbox/cookie-jar.ts`, `sandbox/route.ts` | The colour scheme and day cookies go through `document.cookie`, because no response leaves the page. |
| Start-up | `app/entry.client.tsx`, `sandbox/boot.ts` | Opens the database before the app hydrates, and puts it on the `cloudflareEnv` router context, where loaders read it. |

The data functions' SQL is unchanged from `main`. Where a test in
`sandbox/*.test.ts` finds a gap between sql.js and D1, fix it in the adapter,
not in the SQL.

### Config that differs from `main`

- `react-router.config.ts`: `ssr: false`, and `splitRouteModules: false`.
  React Router picks a route's split chunks from the file on disk, before the
  rewrite adds the client exports, so a split route would lose its loader.
- `vite.config.ts`: the Cloudflare plugin is gone and `sandbox()` comes first.
- `wrangler.jsonc`: static assets only. No D1, no cron, no route, no Worker
  script. `workers/app.ts` stays, unused, so a rebase does not conflict on it.
- `package.json`: `deploy` and `deploy:ci` refuse to run, the `db:migrate:*`
  scripts are gone, and `upload:preview` uploads a preview version.
- `vitest.config.ts`: a second project, `sandbox`, runs `sandbox/*.test.ts`
  in Node. The Workers project runs the tests of `main` as before.
- `sandbox/env.d.ts` declares `DB` and `MAIL_FROM`, which the regenerated
  `worker-configuration.d.ts` no longer holds.

### What does not work here

- `/api/tasks`, `/api/auth/*` and `/api/invite` are APIs for other programs.
  A static site has no server to answer them.
- The login, bootstrap and reset-password pages redirect away or answer 404.
  Sam is always signed in, and the seed already made the accounts. Sign out
  does nothing.

## Run it locally

```sh
pnpm install
pnpm dev
```

Open the URL Vite prints. No `.dev.vars` is needed. To check the built files
as Cloudflare serves them:

```sh
pnpm build
pnpm exec wrangler dev --env dev
```

## Deploy

Workers Builds builds this branch as a non-production branch of
`tusker-web-dev`, and gives it a preview URL. The production deploy of `main`
is not touched.

In **Workers & Pages → tusker-web-dev → Settings → Build**, the
non-production branch deploy command must upload a version and nothing else:

```sh
pnpm exec wrangler versions upload --env dev --preview-alias ui-sandbox
```

It must not run `deploy:ci`, which migrates the dev D1. On this branch that
script fails on purpose. A build log with a `d1 migrations apply` line is
wrong.

From your machine, `pnpm run upload:preview` does the same.

## Rebase onto `main`

```sh
git fetch origin
git rebase origin/main
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Conflicts land in the config files listed above, not in `app/`. After the
rebase, open the built app and click through the pages:

- A new route file needs nothing. The rewrite finds every file under
  `app/routes/` and `app/layouts/`.
- A new migration needs nothing. A saved database runs it on its next load.
- A new `.server` module that reaches outside the browser (a new mail
  provider, a new auth call) needs a swap in `sandbox/vite-plugin.ts`.
- A new export shape the rewrite does not match (for example
  `export { loader }`) fails the build with React Router's own SPA-mode
  message. Add the shape to `MOVED` in `sandbox/vite-plugin.ts`.
- A seed step that calls a data function whose signature changed fails
  `pnpm typecheck`.
