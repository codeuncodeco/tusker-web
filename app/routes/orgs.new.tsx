import { Form, Link, redirect } from "react-router";

import { cloudflareEnv } from "../context.server";
import { fieldClass } from "../forms";
import { createTeamOrg, freeSlug, slugify } from "../orgs.server";
import { requirePerson } from "../session.server";
import type { Route } from "./+types/orgs.new";

export function meta(_: Route.MetaArgs) {
  return [{ title: "New org — Tusker" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requirePerson(request, context.get(cloudflareEnv));
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const person = await requirePerson(request, env);

  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const typed = String(form.get("slug") ?? "").trim();

  if (!name) return { error: "An org needs a name." };

  // A typed slug is the person's word, so a taken one is an error they can
  // fix. A blank field takes the name, and then Tusker finds the free slug.
  const slug = typed ? slugify(typed) : await freeSlug(env.DB, slugify(name) || "org");
  if (!slug) return { error: "That slug holds no letter or number." };

  const org = await createTeamOrg(env.DB, { name, slug, personId: person.id });
  if (!org) return { error: `Another org already holds /${slug}.` };

  return redirect(`/o/${org.slug}/board`);
}

export default function NewOrg({ actionData }: Route.ComponentProps) {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">New org</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        You become its owner. Add the rest of the people from the org's Members page.
      </p>

      <Form method="post" className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          Name
          <input name="name" required autoFocus className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1">
          Slug <span className="text-sm text-neutral-500">The URL, as in /o/codeuncode/board. Optional.</span>
          <input name="slug" placeholder="from the name" className={fieldClass} />
        </label>

        {actionData?.error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {actionData.error}
          </p>
        ) : null}

        <button className="rounded bg-neutral-900 px-3 py-2 text-white dark:bg-neutral-100 dark:text-neutral-900">
          Make the org
        </button>
      </Form>

      <Link to="/account" className="text-sm underline">
        Back to you
      </Link>
    </main>
  );
}
