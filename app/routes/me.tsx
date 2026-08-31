import { Form, Link, redirect } from "react-router";

import { createAuth } from "../auth.server";
import { cloudflareEnv } from "../context.server";
import { listOrgsForPerson } from "../orgs.server";
import { requirePerson, withCookies } from "../session.server";
import type { Route } from "./+types/me";

export function meta(_: Route.MetaArgs) {
  return [{ title: "You — Tusker" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const person = await requirePerson(request, env);
  const orgs = await listOrgsForPerson(env.DB, person.id);
  return { person: { name: person.name, email: person.email }, orgs };
}

export async function action({ request, context }: Route.ActionArgs) {
  const auth = createAuth(context.get(cloudflareEnv), request);
  const response = await auth.api.signOut({ headers: request.headers, asResponse: true });
  return withCookies(response, redirect("/login"));
}

export default function Me({ loaderData }: Route.ComponentProps) {
  const { person, orgs } = loaderData;

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">{person.name || person.email}</h1>
      <p className="text-neutral-600 dark:text-neutral-400">{person.email}</p>

      <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Orgs</h2>
        <ul className="mt-2 list-disc pl-5">
          {orgs.map((org) => (
            <li key={org.id}>
              <Link to={`/o/${org.slug}/board`} className="underline">
                {org.name}
              </Link>{" "}
              <span className="text-neutral-500">/{org.slug}</span>
              {org.kind === "personal" ? (
                <span className="ml-2 text-xs uppercase tracking-wide text-neutral-500">personal</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <Form method="post">
        <button className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700">Sign out</button>
      </Form>
    </main>
  );
}
