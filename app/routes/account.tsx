/**
 * The account page: the name, the orgs and Sign out.
 *
 * It held `/me` until the unified view took that URL. A page of work earns the
 * front door more than a page of links.
 */

import { Form, Link, redirect } from "react-router";

import { createAuth } from "../auth.server";
import { cloudflareEnv } from "../context.server";
import { listOrgsForPerson } from "../orgs.server";
import { requirePerson, withCookies } from "../session.server";
import type { Route } from "./+types/account";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Your account — Tusker" }];
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

export default function Account({ loaderData }: Route.ComponentProps) {
  const { person, orgs } = loaderData;

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">{person.name || person.email}</h1>
      <p className="text-neutral-600 dark:text-neutral-400">{person.email}</p>

      <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">Orgs</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {orgs.map((org) => (
            <li key={org.id}>
              <Link to={`/o/${org.slug}/board`} className="underline">
                {org.name}
              </Link>{" "}
              <span className="text-neutral-500">/{org.slug}</span>
              {org.kind === "personal" ? (
                <span className="ml-2 text-xs uppercase tracking-wide text-neutral-500">personal</span>
              ) : null}{" "}
              <Link to={`/o/${org.slug}/members`} className="ml-2 text-sm underline">
                Members
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/orgs/new" className="mt-3 inline-block text-sm underline">
          New org
        </Link>
      </section>

      <Link to="/me" className="text-sm underline">
        Your tasks
      </Link>

      <Form method="post">
        <button className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700">Sign out</button>
      </Form>
    </main>
  );
}
