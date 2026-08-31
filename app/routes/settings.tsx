import { Form, redirect } from "react-router";

import { cloudflareEnv } from "../context.server";
import { fieldClass } from "../forms";
import { OrgNav } from "../org-nav";
import { renameOrg, slugify } from "../orgs.server";
import { requireScope } from "../scope.server";
import type { Route } from "./+types/settings";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Settings for ${loaderData.org.name} — Tusker` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const scope = await requireScope(request, context.get(cloudflareEnv), params.slug);
  return { org: { slug: scope.org.slug, name: scope.org.name } };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug);

  const form = await request.formData();
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
  const { org } = loaderData;

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

        {actionData?.error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {actionData.error}
          </p>
        ) : null}

        <button className="self-start rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700">
          Save
        </button>
      </Form>
    </main>
  );
}
