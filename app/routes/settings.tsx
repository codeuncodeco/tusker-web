import { Form, redirect } from "react-router";

import { colorHex, readColor } from "../colors";
import { cloudflareEnv } from "../context.server";
import { fieldClass } from "../forms";
import { OrgDot } from "../org-chip";
import { createOrgKey, listOrgKeys, revokeOrgKey } from "../org-keys.server";
import { readOrgApp, renameOrg, setOrgApp, setOrgColor, slugify } from "../orgs.server";
import { isRefsBaseUrl } from "../refs";
import { refreshOrgFields } from "../refs.server";
import { requireScope } from "../scope.server";
import type { Route } from "./+types/settings";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Settings for ${loaderData.org.name} — Tusker` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);
  return {
    org: { slug: scope.org.slug, name: scope.org.name, color: scope.org.color },
    // The keys carry no plaintext, so this payload is safe in the browser.
    keys: await listOrgKeys(env.DB, scope),
    // The base URL is an address. The key is not here, only whether it is set.
    app: await readOrgApp(env.DB, scope),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "rename");

  if (intent === "mint-key") {
    const name = String(form.get("key_name") ?? "").trim();
    if (!name) return { keyError: "A key needs a name, so you can tell it from the next one." };
    // The one time the key is readable. It is not in the loader, and no row
    // holds it, so a person who misses it mints another.
    return { key: await createOrgKey(env.DB, scope, name) };
  }

  if (intent === "org-app") {
    const base = String(form.get("refs_base_url") ?? "").trim();
    const key = String(form.get("refs_key") ?? "").trim();
    if (!isRefsBaseUrl(base)) {
      return { appError: "An org app needs a base URL, as https://blrhikes.example/api/tusker/refs." };
    }

    const app = await readOrgApp(env.DB, scope);
    if (!key && !app.has_refs_key) {
      return { appError: "Paste the refs key the org app minted for this org." };
    }

    await setOrgApp(env.DB, scope, { refs_base_url: base, refs_key: key });

    // The save says what it did, because a paste that reached no field is
    // otherwise silent until a picker stops filling.
    return { app: await refreshOrgFields(env.DB, scope) };
  }

  if (intent === "color") {
    // Any member may set it. Membership is the only permission check Tusker
    // has, and the scope is that check. See ADR-0020.
    const read = readColor(form.get("color"));
    if ("error" in read) return { colorError: read.error };

    await setOrgColor(env.DB, scope, read.color);
    return { ok: true };
  }

  if (intent === "revoke-key") {
    const revoked = await revokeOrgKey(env.DB, scope, String(form.get("id") ?? ""));
    if (!revoked) throw new Response("Not found", { status: 404 });
    return { ok: true };
  }

  const name = String(form.get("name") ?? "").trim();
  const slug = slugify(String(form.get("slug") ?? ""));

  if (!name) return { error: "An org needs a name." };
  if (!slug) return { error: "A slug needs a letter or a number." };

  const done = await renameOrg(env.DB, scope.org.id, { name, slug });
  if (done === "taken") return { error: `Another org already holds /${slug}.` };

  // Every page of this org moved, so the answer names the new address.
  return redirect(`/o/${slug}/settings`);
}

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { org, keys, app } = loaderData;

  return (
    <main className="mx-auto flex flex-1 max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl tracking-tight">Settings</h1>

      <Form method="post" className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          Name
          <input name="name" required defaultValue={org.name} className={fieldClass} />
        </label>

        <label className="flex flex-col gap-1">
          Slug
          <span className="text-muted">
            The URL of every page of this org, as in /o/{org.slug}/board. An old link stops working
            once you change it.
          </span>
          <input name="slug" required defaultValue={org.slug} className={fieldClass} />
        </label>

        {actionData && "error" in actionData && actionData.error ? (
          <p role="alert" className="text-danger">
            {actionData.error}
          </p>
        ) : null}

        <button className="self-start rounded border border-border px-3 py-2">
          Save
        </button>
      </Form>

      <ColorForm org={org} actionData={actionData} />

      <OrgAppForm app={app} actionData={actionData} />

      <Keys slug={org.slug} keys={keys} actionData={actionData} />
    </main>
  );
}

/**
 * The colour this org draws on a page that mixes several.
 *
 * The control is the browser's own colour picker, so a person chooses a colour
 * rather than spelling one. It always answers an exact colour, and it cannot
 * answer nothing, so Clear is its own button: it posts an empty box, which the
 * action already reads as no colour. An org with no colour draws grey. See
 * ADR-0020.
 *
 * An org that already holds a palette name keeps it until somebody saves. The
 * picker opens on the swatch that name draws.
 */
function ColorForm({
  org,
  actionData,
}: {
  org: Route.ComponentProps["loaderData"]["org"];
  actionData: Route.ComponentProps["actionData"];
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <h2 className="text-lg tracking-tight">Colour</h2>
      <p className="text-muted">
        The dot beside this org's name on your board, your plan and your week, where tasks of every
        org you belong to sit together. Any member can change it.
      </p>

      <div className="flex items-end gap-2">
        <Form method="post" className="flex items-end gap-2">
          <input type="hidden" name="intent" value="color" />

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-2">
              Colour
              <OrgDot color={org.color} />
            </span>
            <input
              type="color"
              name="color"
              defaultValue={colorHex(org.color)}
              className="h-10 w-16 cursor-pointer rounded border border-border bg-transparent p-1"
            />
          </label>

          <button className="rounded border border-border px-3 py-2">
            Save the colour
          </button>
        </Form>

        {org.color ? (
          <Form method="post">
            <input type="hidden" name="intent" value="color" />
            <input type="hidden" name="color" value="" />
            <button className="rounded border border-border px-3 py-2 text-muted">
              Clear
            </button>
          </Form>
        ) : null}
      </div>

      {actionData && "colorError" in actionData && actionData.colorError ? (
        <p role="alert" className="text-danger">
          {actionData.colorError}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The org keys, and the one place a key is readable.
 *
 * An org app reads this org's tasks with a key, so the crew who look at that
 * screen need no Tusker account. Tusker holds a hash, so the plaintext shows
 * once, right after the mint, and never again.
 */
function Keys({
  slug,
  keys,
  actionData,
}: {
  slug: string;
  keys: Route.ComponentProps["loaderData"]["keys"];
  actionData: Route.ComponentProps["actionData"];
}) {
  const minted = actionData && "key" in actionData ? actionData.key : null;

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <h2 className="text-lg tracking-tight">Keys for org apps</h2>
      <p className="text-muted">
        An app of this org reads its tasks at /api/tasks with one of these keys. The key stands for
        the org, not for you, so nobody using that app needs a Tusker account.
      </p>

      {minted ? (
        <div className="flex flex-col gap-1 rounded border border-green-600 p-3">
          <span>Copy this key now. Tusker cannot show it again.</span>
          <code className="break-all font-mono">{minted}</code>
        </div>
      ) : null}

      {keys.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {keys.map((one) => (
            <li key={one.id} className="flex items-baseline gap-3">
              <span className={one.revoked_at ? "text-muted line-through" : ""}>{one.name}</span>
              <code className="font-mono text-muted">{one.preview}…</code>
              {one.revoked_at ? (
                <span className="text-muted">Revoked</span>
              ) : (
                <Form method="post">
                  <input type="hidden" name="intent" value="revoke-key" />
                  <input type="hidden" name="id" value={one.id} />
                  <button className="text-danger underline">Revoke</button>
                </Form>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <Form method="post" className="flex items-end gap-2">
        <input type="hidden" name="intent" value="mint-key" />
        <label className="flex flex-1 flex-col gap-1">
          Name
          <input
            name="key_name"
            required
            placeholder={`${slug}-app`}
            className={fieldClass}
          />
        </label>
        <button className="rounded border border-border px-3 py-2">
          Mint a key
        </button>
      </Form>

      {actionData && "keyError" in actionData && actionData.keyError ? (
        <p role="alert" className="text-danger">
          {actionData.keyError}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The org app this org reads its reference options from: one address and one
 * key, for every reference field of the org.
 *
 * The key box is empty every time. Tusker holds the plaintext, but no screen
 * shows it: the org app minted it and it opens the org app's data. Leaving the
 * box empty keeps the key the org already holds.
 *
 * Saving pulls every reference field and says how many answered, so a rotation
 * that only half worked is visible here rather than in a picker that quietly
 * stopped filling.
 */
function OrgAppForm({
  app,
  actionData,
}: {
  app: Route.ComponentProps["loaderData"]["app"];
  actionData: Route.ComponentProps["actionData"];
}) {
  const pulled = actionData && "app" in actionData ? actionData.app : null;

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <h2 className="text-lg tracking-tight">Org app</h2>
      <p className="text-muted">
        Where this org reads its reference options from. Every reference field of this org reads
        under this address, with this key, and names only the list it wants.
      </p>

      <Form method="post" className="flex flex-col gap-3">
        <input type="hidden" name="intent" value="org-app" />

        <label className="flex flex-col gap-1">
          Base URL
          <span className="text-muted">
            The part every refs endpoint of the org app shares, with no trailing slash.
          </span>
          <input
            name="refs_base_url"
            type="url"
            defaultValue={app.refs_base_url}
            placeholder="https://blrhikes.example/api/tusker/refs"
            className={fieldClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          Refs key
          <span className="text-muted">
            {app.has_refs_key
              ? "This org holds a key. Paste a new one to replace it, or leave this empty to keep it."
              : "Mint it in the org app. It is shown there once."}
          </span>
          <input name="refs_key" type="password" autoComplete="off" className={fieldClass} />
        </label>

        {pulled ? (
          <p className="text-muted">
            Saved. {pulled.fields - pulled.failed} of {pulled.fields} reference field
            {pulled.fields === 1 ? "" : "s"} pulled.
          </p>
        ) : null}

        {actionData && "appError" in actionData && actionData.appError ? (
          <p role="alert" className="text-danger">
            {actionData.appError}
          </p>
        ) : null}

        <button className="self-start rounded border border-border px-3 py-2">
          Save the org app
        </button>
      </Form>
    </section>
  );
}
