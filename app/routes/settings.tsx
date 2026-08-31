import { Form, redirect } from "react-router";

import { cloudflareEnv } from "../context.server";
import { fieldClass } from "../forms";
import { createOrgKey, listOrgKeys, revokeOrgKey } from "../org-keys.server";
import { OrgNav } from "../org-nav";
import { renameOrg, slugify } from "../orgs.server";
import { requireScope } from "../scope.server";
import type { Route } from "./+types/settings";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Settings for ${loaderData.org.name} — Tusker` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug);
  return {
    org: { slug: scope.org.slug, name: scope.org.name },
    // The keys carry no plaintext, so this payload is safe in the browser.
    keys: await listOrgKeys(env.DB, scope),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "rename");

  if (intent === "mint-key") {
    const name = String(form.get("key_name") ?? "").trim();
    if (!name) return { keyError: "A key needs a name, so you can tell it from the next one." };
    // The one time the key is readable. It is not in the loader, and no row
    // holds it, so a person who misses it mints another.
    return { key: await createOrgKey(env.DB, scope, name) };
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
  const { org, keys } = loaderData;

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <OrgNav slug={org.slug} here="settings" />
      </header>

      <Form method="post" className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          Name
          <input name="name" required defaultValue={org.name} className={fieldClass} />
        </label>

        <label className="flex flex-col gap-1">
          Slug
          <span className="text-sm text-neutral-500">
            The URL of every page of this org, as in /o/{org.slug}/board. An old link stops working
            once you change it.
          </span>
          <input name="slug" required defaultValue={org.slug} className={fieldClass} />
        </label>

        {actionData && "error" in actionData && actionData.error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {actionData.error}
          </p>
        ) : null}

        <button className="self-start rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700">
          Save
        </button>
      </Form>

      <Keys slug={org.slug} keys={keys} actionData={actionData} />
    </main>
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
    <section className="flex flex-col gap-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <h2 className="text-lg font-semibold tracking-tight">Keys for org apps</h2>
      <p className="text-sm text-neutral-500">
        An app of this org reads its tasks at /api/tasks with one of these keys. The key stands for
        the org, not for you, so nobody using that app needs a Tusker account.
      </p>

      {minted ? (
        <div className="flex flex-col gap-1 rounded border border-green-600 p-3 dark:border-green-700">
          <span className="text-sm">Copy this key now. Tusker cannot show it again.</span>
          <code className="break-all font-mono text-sm">{minted}</code>
        </div>
      ) : null}

      {keys.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {keys.map((one) => (
            <li key={one.id} className="flex items-baseline gap-3">
              <span className={one.revoked_at ? "text-neutral-500 line-through" : ""}>{one.name}</span>
              <code className="font-mono text-sm text-neutral-500">{one.preview}…</code>
              {one.revoked_at ? (
                <span className="text-sm text-neutral-500">Revoked</span>
              ) : (
                <Form method="post">
                  <input type="hidden" name="intent" value="revoke-key" />
                  <input type="hidden" name="id" value={one.id} />
                  <button className="text-sm text-red-700 underline dark:text-red-400">Revoke</button>
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
        <button className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700">
          Mint a key
        </button>
      </Form>

      {actionData && "keyError" in actionData && actionData.keyError ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {actionData.keyError}
        </p>
      ) : null}
    </section>
  );
}
