/**
 * The account page: the name, the orgs and Sign out.
 *
 * It held `/me` until the unified board took that URL. `/me` now shows the
 * tasks, because a person opens Tusker to work, not to read a list of links.
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
    <main className="mx-auto flex flex-1 max-w-2xl flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl tracking-tight">{person.name || person.email}</h1>
      <p className="text-muted">{person.email}</p>

      <section className="rounded-lg border border-border p-4">
        <h2 className="uppercase tracking-wide text-muted">Orgs</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {orgs.map((org) => (
            <li key={org.id}>
              <Link to={`/o/${org.slug}/board`} className="underline">
                {org.name}
              </Link>{" "}
              <span className="text-muted">/{org.slug}</span>
              {org.kind === "personal" ? (
                <span className="ml-2 text-xs uppercase tracking-wide text-muted">personal</span>
              ) : null}{" "}
              <Link to={`/o/${org.slug}/members`} className="ml-2 underline">
                Members
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/orgs/new" className="mt-3 inline-block underline">
          New org
        </Link>
      </section>

      <Form method="post">
        <button className="rounded border border-border px-3 py-2">Sign out</button>
      </Form>
    </main>
  );
}
